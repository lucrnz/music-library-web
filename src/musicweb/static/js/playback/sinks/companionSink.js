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
  onCompanionEvent,
} from "../../exclusive/companionClient.js";

/** @typedef {import('./types.js').PlaybackSink} PlaybackSink */
/** @typedef {import('./types.js').SinkHandlers} SinkHandlers */

/**
 * @returns {PlaybackSink}
 */
export function createCompanionSink() {
  /** @type {SinkHandlers} */
  let handlers = {};
  let paused = true;
  let currentTime = 0;
  let duration = 0;
  let unsub = null;

  function ensureListen() {
    if (unsub) return;
    unsub = onCompanionEvent((evt) => {
      if (evt.type === "time") {
        currentTime = Number(evt.t) || 0;
        const d = Number(evt.d);
        if (Number.isFinite(d) && d > 0) duration = d;
        handlers.onTime?.(currentTime, duration);
      } else if (evt.type === "pause") {
        paused = !!evt.paused;
        handlers.onPauseState?.(paused);
      } else if (evt.type === "eof") {
        paused = true;
        handlers.onEnded?.();
      } else if (evt.type === "error" || evt.type === "disconnect") {
        handlers.onError?.(
          evt.message || "Exclusive companion disconnected",
          evt.code || null
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
    async load(url) {
      ensureListen();
      paused = false;
      currentTime = 0;
      duration = 0;
      const ok = companionLoad(url);
      if (!ok) {
        throw new Error("Companion not ready for load");
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
