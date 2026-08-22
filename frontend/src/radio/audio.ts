/**
 * Radio-owned HTMLAudioElement. Not the shared on-demand html sink.
 */
import {
  setHtmlAudioSrc,
  setHtmlAudioVolume,
  stopHtmlAudio,
  waitAudioEvent,
} from "@/playback/sinks/htmlElement";

export function shouldIgnoreTransport(loadInFlight: boolean, seekInFlight: boolean): boolean {
  return loadInFlight || seekInFlight;
}

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

  if (el) {
    el.addEventListener("pause", () => {
      if (shouldIgnorePause(loadInFlight, seekInFlight, el.ended)) return;
      onPauseFn?.();
    });
    el.addEventListener("ended", () => {
      if (shouldIgnoreTransport(loadInFlight, seekInFlight)) return;
      onEndedFn?.();
    });
    el.addEventListener("error", () => {
      if (shouldIgnoreTransport(loadInFlight, seekInFlight)) return;
      onErrorFn?.();
    });
  }

  return {
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
      try {
        el.pause();
        setHtmlAudioSrc(el, url);
        el.load();
        await waitAudioEvent(el, "canplay");
      } finally {
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
}
