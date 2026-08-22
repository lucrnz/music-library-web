/**
 * Radio-owned HTMLAudioElement. Not the shared on-demand html sink.
 */
import {
  setHtmlAudioSrc,
  setHtmlAudioVolume,
  stopHtmlAudio,
  waitAudioEvent,
} from "@/playback/sinks/htmlElement";
import type { PlaybackSink, SinkHandlers } from "@/playback/sinks/types";

export function shouldIgnoreTransport(loadInFlight: boolean, seekInFlight: boolean): boolean {
  return loadInFlight || seekInFlight;
}

export const RADIO_LOAD_TIMEOUT_MS = 8000;

export function shouldIgnorePause(
  loadInFlight: boolean,
  seekInFlight: boolean,
  ended: boolean,
): boolean {
  return shouldIgnoreTransport(loadInFlight, seekInFlight) || ended;
}

export interface RadioAudio {
  readonly el: HTMLAudioElement | null;
  readonly loadInFlight: boolean;
  readonly seekInFlight: boolean;
  readonly sink: PlaybackSink;
  currentTime: number;
  paused: boolean;
  ended: boolean;
  load(url: string): Promise<void>;
  seek(seconds: number): Promise<void>;
  play(): Promise<void>;
  stop(): void;
  setVolume(v: number): void;
  onPause(fn: () => void): void;
  onEnded(fn: () => void): void;
  onError(fn: () => void): void;
}

export function createRadioAudio(): RadioAudio {
  const el = typeof Audio !== "undefined" ? new Audio() : null;
  if (el) {
    el.preload = "auto";
  }
  let loadInFlight = false;
  let seekInFlight = false;
  let onPauseFn: (() => void) | null = null;
  let onEndedFn: (() => void) | null = null;
  let onErrorFn: (() => void) | null = null;
  let handlers: SinkHandlers = {};

  if (el) {
    el.addEventListener("pause", () => {
      if (shouldIgnorePause(loadInFlight, seekInFlight, el.ended)) return;
      onPauseFn?.();
      handlers.onPauseState?.(true);
    });
    el.addEventListener("play", () => {
      handlers.onPauseState?.(false);
    });
    el.addEventListener("ended", () => {
      if (shouldIgnoreTransport(loadInFlight, seekInFlight)) return;
      onEndedFn?.();
      handlers.onEnded?.();
    });
    el.addEventListener("error", () => {
      if (shouldIgnoreTransport(loadInFlight, seekInFlight)) return;
      onErrorFn?.();
    });
    el.addEventListener("timeupdate", () => {
      handlers.onTime?.(el.currentTime || 0, el.duration);
    });
    el.addEventListener("loadedmetadata", () => {
      handlers.onDuration?.(el.duration);
    });
  }

  const radio: Omit<RadioAudio, "sink"> = {
    el,
    get loadInFlight() {
      return loadInFlight;
    },
    get seekInFlight() {
      return seekInFlight;
    },
    get currentTime() {
      return el?.currentTime ?? 0;
    },
    get paused() {
      return el?.paused ?? true;
    },
    get ended() {
      return el?.ended ?? false;
    },
    async load(url: string) {
      if (!el) return;
      loadInFlight = true;
      let timer: ReturnType<typeof setTimeout> | null = null;
      try {
        el.pause();
        setHtmlAudioSrc(el, url);
        el.load();
        await Promise.race([
          waitAudioEvent(el, "canplay"),
          new Promise<void>((_, reject) => {
            timer = setTimeout(
              () => reject(new Error("audio canplay timeout")),
              RADIO_LOAD_TIMEOUT_MS,
            );
          }),
        ]);
      } finally {
        if (timer != null) clearTimeout(timer);
        loadInFlight = false;
      }
    },
    async seek(seconds: number) {
      if (!el) return;
      seekInFlight = true;
      try {
        const dur = Number.isFinite(el.duration) ? el.duration : seconds;
        el.currentTime = Math.max(0, Math.min(seconds, dur || seconds));
        await waitAudioEvent(el, "seeked");
      } finally {
        seekInFlight = false;
      }
    },
    async play() {
      if (!el) return;
      await el.play();
    },
    stop() {
      if (!el) return;
      loadInFlight = false;
      seekInFlight = false;
      stopHtmlAudio(el);
    },
    setVolume(v: number) {
      if (!el) return;
      setHtmlAudioVolume(el, v);
    },
    onPause(fn) {
      onPauseFn = fn;
    },
    onEnded(fn) {
      onEndedFn = fn;
    },
    onError(fn) {
      onErrorFn = fn;
    },
  };

  const sink: PlaybackSink = {
    kind: "htmlAudio",
    setHandlers(h) {
      handlers = h || {};
    },
    load(url) {
      return radio.load(url);
    },
    pause() {
      el?.pause();
    },
    resume() {
      return el?.play();
    },
    stop() {
      radio.stop();
    },
    seek(seconds) {
      if (!el || !Number.isFinite(seconds)) return;
      el.currentTime = seconds;
    },
    setVolume(v) {
      radio.setVolume(v);
    },
    get paused() {
      return radio.paused;
    },
    get currentTime() {
      return radio.currentTime;
    },
    get duration() {
      return el && Number.isFinite(el.duration) ? el.duration : 0;
    },
    get playbackRate() {
      return el?.playbackRate || 1;
    },
  };

  return Object.assign(radio, { sink });
}
