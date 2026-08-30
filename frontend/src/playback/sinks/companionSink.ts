/**
 * Companion (mpv) playback sink via exclusive WebSocket client.
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
import {
  PlayBlockError,
  isPlayBlockReason,
} from "@/playBlock";
import type { PlaybackSink, SinkHandlers } from "@/playback/sinks/types";

function companionBlock(
  code: string | null | undefined,
  message: string,
): PlayBlockError {
  if (isPlayBlockReason(code)) return new PlayBlockError(code, message);
  return new PlayBlockError("exclusive_failed", message);
}

export function createCompanionSink(): PlaybackSink {
  let handlers: SinkHandlers = {};
  let paused = true;
  let currentTime = 0;
  let duration = 0;
  let hasLoad = false;
  let unsub: (() => void) | null = null;
  const durationWaiters: Array<() => void> = [];

  function flushDurationWaiters(): void {
    if (!(duration > 0) || !durationWaiters.length) return;
    const pending = durationWaiters.splice(0, durationWaiters.length);
    for (const resolve of pending) resolve();
  }

  function ensureListen(): void {
    if (unsub) return;
    unsub = onCompanionEvent((evt) => {
      if (!hasLoad) return;
      if (evt.type === "time") {
        currentTime = Number(evt.t) || 0;
        const d = Number(evt.d);
        if (Number.isFinite(d) && d > 0) duration = d;
        flushDurationWaiters();
        handlers.onTime?.(currentTime, duration);
      } else if (evt.type === "pause") {
        paused = !!evt.paused;
        handlers.onPauseState?.(paused);
      } else if (evt.type === "eof") {
        paused = true;
        if (hasLoad) handlers.onEnded?.();
      } else if (evt.type === "released") {
        hasLoad = false;
        paused = true;
      } else if (evt.type === "error" || evt.type === "disconnect") {
        if (!hasLoad) return;
        handlers.onError?.(
          companionBlock(
            evt.code,
            evt.message || "Exclusive companion disconnected",
          ),
        );
      }
    });
  }

  return {
    kind: "companion",
    setHandlers(h) {
      handlers = h || {};
      ensureListen();
    },
    async load(url, opts) {
      const hog = opts?.hog !== false;
      if (hog) {
        const gate = await ensurePreferredDevice({ timeoutMs: 1500 });
        if (!gate.ok) {
          throw new PlayBlockError(gate.reason);
        }
      }
      ensureListen();
      paused = false;
      currentTime = 0;
      duration = 0;
      hasLoad = companionLoad(url, hog ? { hog: true } : { hog: false });
      if (!hasLoad) {
        throw new PlayBlockError(
          "exclusive_not_ready",
          "Companion not ready for load",
        );
      }
    },
    pause() {
      companionPause();
      paused = true;
    },
    resume() {
      companionResume();
      paused = false;
    },
    stop() {
      hasLoad = false;
      companionStop();
      paused = true;
      currentTime = 0;
      duration = 0;
    },
    seek(seconds) {
      if (!Number.isFinite(seconds)) return;
      // Disable seek until we know duration (design risk mitigation).
      if (!(duration > 0)) return;
      companionSeek(seconds);
      currentTime = seconds;
    },
    setVolume(v0to1) {
      const v = Math.min(1, Math.max(0, Number(v0to1) || 0));
      companionSetVolume(v * 100);
    },
    waitForDuration() {
      if (duration > 0) return Promise.resolve();
      return new Promise<void>((resolve) => {
        durationWaiters.push(resolve);
      });
    },
    get paused() {
      return paused;
    },
    get currentTime() {
      return currentTime;
    },
    get duration() {
      return duration;
    },
    get playbackRate() {
      return 1;
    },
  };
}
