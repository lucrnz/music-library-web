/**
 * Radio-owned audio. HTML element by default; companion (mpv) when exclusive.
 */
import {
  companionLoad,
  companionPause,
  companionResume,
  companionSeek,
  companionSetVolume,
  companionStop,
  ensurePreferredDevice,
  onCompanionEvent,
} from "@/exclusive/companionClient";
import { PlayBlockError } from "@/playBlock";
import { JOIN_LOAD_TIMEOUT_MS } from "@/playback/joinTimeout";
import {
  setHtmlAudioSrc,
  setHtmlAudioVolume,
  stopHtmlAudio,
  waitAudioEvent,
  waitAudioEventWithTimeout,
} from "@/playback/sinks/htmlElement";
import type { PlaybackSink, SinkHandlers } from "@/playback/sinks/types";

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

export type RadioAudioBackend = "htmlAudio" | "companion";

export interface RadioAudio {
  readonly el: HTMLAudioElement | null;
  readonly loadInFlight: boolean;
  readonly seekInFlight: boolean;
  readonly duration: number;
  readonly sink: PlaybackSink;
  currentTime: number;
  paused: boolean;
  ended: boolean;
  setBackend(kind: RadioAudioBackend): void;
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
  let backend: RadioAudioBackend = "htmlAudio";
  let loadInFlight = false;
  let seekInFlight = false;
  let onPauseFn: (() => void) | null = null;
  let onEndedFn: (() => void) | null = null;
  let onErrorFn: (() => void) | null = null;
  let handlers: SinkHandlers = {};
  let companionTime = 0;
  let companionDuration = 0;
  let companionPaused = true;
  let companionEnded = false;
  let unsubCompanion: (() => void) | null = null;
  const durationWaiters = new Set<() => void>();

  if (el) {
    el.addEventListener("pause", () => {
      if (backend !== "htmlAudio") return;
      if (shouldIgnorePause(loadInFlight, seekInFlight, el.ended)) return;
      onPauseFn?.();
      handlers.onPauseState?.(true);
    });
    el.addEventListener("play", () => {
      if (backend !== "htmlAudio") return;
      handlers.onPauseState?.(false);
    });
    el.addEventListener("ended", () => {
      if (backend !== "htmlAudio") return;
      if (shouldIgnoreTransport(loadInFlight, seekInFlight)) return;
      onEndedFn?.();
      handlers.onEnded?.();
    });
    el.addEventListener("error", () => {
      if (backend !== "htmlAudio") return;
      if (shouldIgnoreTransport(loadInFlight, seekInFlight)) return;
      onErrorFn?.();
    });
    el.addEventListener("timeupdate", () => {
      if (backend !== "htmlAudio") return;
      handlers.onTime?.(el.currentTime || 0, el.duration);
    });
    el.addEventListener("loadedmetadata", () => {
      if (backend !== "htmlAudio") return;
      handlers.onDuration?.(el.duration);
    });
  }

  function notifyDurationWaiters(): void {
    for (const fn of [...durationWaiters]) fn();
  }

  function waitCompanionDuration(): Promise<void> {
    if (companionDuration > 0) return Promise.resolve();
    return new Promise((resolve, reject) => {
      let timer: ReturnType<typeof setTimeout> | null = null;
      let settled = false;
      const finish = (err?: Error) => {
        if (settled) return;
        settled = true;
        durationWaiters.delete(check);
        if (timer != null) clearTimeout(timer);
        if (err) reject(err);
        else resolve();
      };
      const check = () => {
        if (companionDuration > 0) finish();
      };
      durationWaiters.add(check);
      timer = setTimeout(
        () => finish(new Error("audio canplay timeout")),
        JOIN_LOAD_TIMEOUT_MS,
      );
    });
  }

  function applyCompanionEvent(evt: { type: string; t?: unknown; d?: unknown; paused?: unknown }): void {
    if (backend !== "companion") return;
    if (evt.type === "time") {
      companionTime = Number(evt.t) || 0;
      const d = Number(evt.d);
      if (Number.isFinite(d) && d > 0) {
        companionDuration = d;
        notifyDurationWaiters();
      }
      handlers.onTime?.(companionTime, companionDuration);
    } else if (evt.type === "pause") {
      companionPaused = !!evt.paused;
      if (shouldIgnorePause(loadInFlight, seekInFlight, companionEnded)) return;
      if (companionPaused) {
        onPauseFn?.();
        handlers.onPauseState?.(true);
      } else {
        handlers.onPauseState?.(false);
      }
    } else if (evt.type === "eof") {
      companionPaused = true;
      companionEnded = true;
      if (shouldIgnoreTransport(loadInFlight, seekInFlight)) return;
      onEndedFn?.();
      handlers.onEnded?.();
    } else if (evt.type === "released") {
      resetCompanionState();
    } else if (evt.type === "error" || evt.type === "disconnect") {
      if (shouldIgnoreTransport(loadInFlight, seekInFlight)) return;
      onErrorFn?.();
    }
  }

  function ensureCompanionListen(): void {
    if (unsubCompanion) return;
    unsubCompanion = onCompanionEvent(applyCompanionEvent);
  }

  function resetCompanionState(): void {
    companionTime = 0;
    companionDuration = 0;
    companionPaused = true;
    companionEnded = false;
  }

  function stopHtml(): void {
    if (el) stopHtmlAudio(el);
  }

  function stopCompanionTransport(): void {
    companionStop();
    resetCompanionState();
  }

  const radio: Omit<RadioAudio, "sink"> = {
    el,
    get loadInFlight() {
      return loadInFlight;
    },
    get seekInFlight() {
      return seekInFlight;
    },
    get duration() {
      if (backend === "companion") return companionDuration;
      return el && Number.isFinite(el.duration) ? el.duration : 0;
    },
    get currentTime() {
      return backend === "companion" ? companionTime : (el?.currentTime ?? 0);
    },
    get paused() {
      return backend === "companion" ? companionPaused : (el?.paused ?? true);
    },
    get ended() {
      return backend === "companion" ? companionEnded : (el?.ended ?? false);
    },
    setBackend(kind) {
      if (kind === backend) return;
      loadInFlight = false;
      seekInFlight = false;
      if (backend === "companion") {
        stopCompanionTransport();
        unsubCompanion?.();
        unsubCompanion = null;
      } else {
        stopHtml();
      }
      backend = kind;
      if (kind === "companion") ensureCompanionListen();
    },
    async load(url) {
      if (backend === "companion") {
        loadInFlight = true;
        companionEnded = false;
        companionDuration = 0;
        companionTime = 0;
        companionPaused = false;
        try {
          const gate = await ensurePreferredDevice({ timeoutMs: 1500 });
          if (!gate.ok) {
            throw new PlayBlockError(gate.reason);
          }
          ensureCompanionListen();
          if (!companionLoad(url)) {
            throw new PlayBlockError(
              "exclusive_not_ready",
              "Companion not ready for load",
            );
          }
          await waitCompanionDuration();
        } finally {
          loadInFlight = false;
        }
        return;
      }
      if (!el) return;
      loadInFlight = true;
      try {
        el.pause();
        setHtmlAudioSrc(el, url);
        el.load();
        await waitAudioEventWithTimeout(el, "canplay", JOIN_LOAD_TIMEOUT_MS);
      } finally {
        loadInFlight = false;
      }
    },
    async seek(seconds) {
      if (backend === "companion") {
        seekInFlight = true;
        try {
          if (!(companionDuration > 0)) {
            await waitCompanionDuration();
          }
          if (!Number.isFinite(seconds)) return;
          const dur = companionDuration > 0 ? companionDuration : seconds;
          const t = Math.max(0, Math.min(seconds, dur || seconds));
          companionSeek(t);
          companionTime = t;
        } finally {
          seekInFlight = false;
        }
        return;
      }
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
      if (backend === "companion") {
        companionResume();
        companionPaused = false;
        return;
      }
      if (!el) return;
      await el.play();
    },
    stop() {
      loadInFlight = false;
      seekInFlight = false;
      if (backend === "companion") {
        stopCompanionTransport();
        return;
      }
      if (!el) return;
      stopHtmlAudio(el);
    },
    setVolume(v) {
      if (backend === "companion") {
        const n = Math.min(1, Math.max(0, Number(v) || 0));
        companionSetVolume(n * 100);
        return;
      }
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
    get kind() {
      return backend;
    },
    setHandlers(h) {
      handlers = h || {};
    },
    load(url) {
      return radio.load(url);
    },
    pause() {
      if (backend === "companion") {
        companionPause();
        companionPaused = true;
        return;
      }
      el?.pause();
    },
    resume() {
      if (backend === "companion") {
        companionResume();
        companionPaused = false;
        return;
      }
      return el?.play();
    },
    stop() {
      radio.stop();
    },
    seek(seconds) {
      if (backend === "companion") {
        if (!Number.isFinite(seconds) || !(companionDuration > 0)) return;
        companionSeek(seconds);
        companionTime = seconds;
        return;
      }
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
      return radio.duration;
    },
    get playbackRate() {
      return backend === "companion" ? 1 : el?.playbackRate || 1;
    },
  };

  return Object.assign(radio, { sink });
}
