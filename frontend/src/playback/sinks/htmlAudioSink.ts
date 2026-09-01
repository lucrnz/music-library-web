/**
 * HTMLAudioElement sink — owns the element internally (not exported).
 */

import { JOIN_LOAD_TIMEOUT_MS } from "@/playback/joinTimeout";
import {
  attachHtmlAudio,
  setHtmlAudioSrc,
  setHtmlAudioVolume,
  stopHtmlAudio,
  waitAudioEventWithTimeout,
} from "@/playback/sinks/htmlElement";
import { PlayBlockError } from "@/playBlock";
import { isSoftPlayReject } from "@/playback/playReject";
import type { PlaybackSink, SinkHandlers } from "@/playback/sinks/types";

export function createHtmlAudioSink(): PlaybackSink {
  const audio = new Audio();
  audio.preload = "metadata";
  audio.setAttribute("playsinline", "");

  let handlers: SinkHandlers = {};
  let attached = false;

  function ensureAttached(): void {
    if (attached) return;
    attached = true;
    attachHtmlAudio(audio);
    audio.addEventListener("play", () => handlers.onPauseState?.(false));
    audio.addEventListener("pause", () => handlers.onPauseState?.(true));
    audio.addEventListener("ended", () => handlers.onEnded?.());
    audio.addEventListener("timeupdate", () => {
      handlers.onTime?.(audio.currentTime || 0, audio.duration);
    });
    audio.addEventListener("loadedmetadata", () => {
      handlers.onTime?.(audio.currentTime || 0, audio.duration);
      handlers.onDuration?.(audio.duration);
    });
    audio.addEventListener("error", () => {
      if (!audio.getAttribute("src")) return;
      const media = audio.error;
      handlers.onError?.(
        new PlayBlockError("play_failed", "HTML audio playback failed"),
        {
          media_code: media ? media.code : null,
          network_state: audio.networkState,
          ready_state: audio.readyState,
        },
      );
    });
  }

  return {
    kind: "htmlAudio",
    setHandlers(h) {
      handlers = h || {};
    },
    async load(url) {
      ensureAttached();
      setHtmlAudioSrc(audio, url);
      audio.load();
      try {
        await waitAudioEventWithTimeout(audio, "canplay", JOIN_LOAD_TIMEOUT_MS);
      } catch (err: unknown) {
        throw err instanceof PlayBlockError
          ? err
          : new PlayBlockError(
              "play_failed",
              err instanceof Error ? err.message : "audio canplay timeout",
            );
      }
      try {
        await audio.play();
      } catch (err: unknown) {
        if (isSoftPlayReject(err)) {
          throw new PlayBlockError("play_failed");
        }
        throw err instanceof PlayBlockError
          ? err
          : new PlayBlockError(
              "play_failed",
              err instanceof Error ? err.message : undefined,
            );
      }
    },
    pause() {
      audio.pause();
    },
    resume() {
      return audio.play();
    },
    stop() {
      stopHtmlAudio(audio);
    },
    seek(seconds) {
      if (!Number.isFinite(seconds)) return;
      audio.currentTime = seconds;
    },
    setVolume(v0to1) {
      setHtmlAudioVolume(audio, v0to1);
    },
    get paused() {
      return audio.paused;
    },
    get currentTime() {
      return audio.currentTime || 0;
    },
    get duration() {
      return Number.isFinite(audio.duration) ? audio.duration : 0;
    },
    get playbackRate() {
      return audio.playbackRate || 1;
    },
  };
}
