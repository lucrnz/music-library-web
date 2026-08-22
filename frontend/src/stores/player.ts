/**
 * Playback control + Media Session. Transport goes through the active sink
 * (htmlAudio or exclusive companion) — HTMLAudioElement is not exported.
 * Load/fail lives in playback/load.ts.
 */
import { canReachServer, canUseRemoteMedia } from "@/connectivity";
import { emit } from "@/diag/log";
import { downloads } from "@/downloads/state";
import type { SinkErrorDetails } from "@/playback/sinks/types";
import { type PlayBlockError, isOfflineUnplayable } from "@/playBlock";
import { isPlayableNow } from "@/playback/playIntent";
import {
  beginLoad,
  companionSink,
  failCurrentLoad,
  failCtx,
  getActiveSink,
  htmlSink,
  invalidateLoads,
  loadResolved,
  revokeLocalPlayUrl,
  selectSink,
  still,
  syncTransportFlags,
  teardownOnDemandMedia,
} from "@/playback/load";
import { prepareTracks } from "@/playback/prepare";
import {
  clearPlaybackPosition,
  readPlaybackPosition,
  resumeSeconds,
  writePlaybackPosition,
} from "@/stores/playbackPosition";
import { pl, commit } from "@/stores/playlist";
import { readVolume, setOutputVolume } from "@/stores/playerPrefs";
import {
  invalidateCoverCache,
  updateMediaSession,
} from "@/stores/playerSession";
import { player, setPlayNotice } from "@/stores/playerState";
import { settings } from "@/stores/settings";
import {
  discard as discardListen,
  onEnded as onListenEnded,
  onRestart as onListenRestart,
  onTime as onListenTime,
} from "@/listens/bridge";
import {
  activeSession,
  become,
  installOnDemandMediaSession,
  onLeaveQueue,
} from "@/playback/session";
import { watch } from "vue";

export { player };

/** Seconds before end to urgent-prepare the next queue track (once per load). */
const PREPARE_LEAD_SECONDS = 15;

/**
 * Near-end prepare already fired (or permanently no next) for this playIndex
 * load. Not reset on seek/scrub. Offline does not latch — reconnect can still
 * prepare once while still in the lead window.
 */
let nearEndPrepareSent = false;

/** Cold-load resume seek waiting for sink duration, keyed by playGen. */
let pendingResume: { gen: number; seconds: number } | null = null;

function persistCurrentPosition() {
  const id = pl.current?.id;
  const seconds = player.currentTime;
  if (!id || !Number.isFinite(seconds) || seconds < 0) return;
  writePlaybackPosition(id, seconds);
}

function persistPausePosition() {
  if (player.playSource !== "streaming" && player.playSource !== "downloaded") {
    return;
  }
  if (!getActiveSink().paused) return;
  persistCurrentPosition();
}

function flushPendingResume() {
  const sink = getActiveSink();
  if (!pendingResume || !still(pendingResume.gen)) {
    pendingResume = null;
    return;
  }
  if (player.playSource !== "streaming" && player.playSource !== "downloaded") {
    return;
  }
  const dur = sink.duration;
  if (!(dur > 0)) return;
  const trackId = pl.current?.id;
  const seconds = resumeSeconds({
    trackId,
    saved: trackId
      ? { trackId, seconds: pendingResume.seconds }
      : null,
    duration: dur,
  });
  pendingResume = null;
  if (seconds != null && seconds > 0) sink.seek(seconds);
  player.currentTime = sink.currentTime || 0;
  if (Number.isFinite(dur) && dur > 0) player.duration = dur;
  updatePositionState();
}

const msSupported = "mediaSession" in navigator;

function updatePositionState() {
  if (
    !msSupported ||
    typeof navigator.mediaSession.setPositionState !== "function"
  ) {
    return;
  }
  const sink = getActiveSink();
  const dur = sink.duration;
  if (!Number.isFinite(dur) || dur <= 0) return;
  try {
    navigator.mediaSession.setPositionState({
      duration: dur,
      playbackRate: sink.playbackRate || 1,
      position: Math.min(sink.currentTime, dur),
    });
  } catch {
    /* ignore */
  }
}

/**
 * Sink ended → single advance owner (repeat-one / playNext).
 */
function onSinkEnded() {
  if (player.playSource === "none") return;
  const sink = getActiveSink();
  onListenEnded();
  if (pl.repeat === "one") {
    sink.seek(0);
    Promise.resolve(sink.resume()).catch(console.error);
    onListenRestart();
    return;
  }
  clearPlaybackPosition();
  playNext();
}

function onSinkTime(t: number, d: number) {
  const sink = getActiveSink();
  if (player.seeking) return;
  onListenTime({
    currentTime: t,
    duration: d,
    playing: !sink.paused,
  });
  if (Number.isFinite(d) && d > 0) player.duration = d;
  if (pendingResume && still(pendingResume.gen)) {
    flushPendingResume();
    return;
  }
  player.currentTime = t || 0;
  updatePositionState();
  maybePrepareNext();
}

function wireSinkHandlers() {
  const handlers = {
    onTime: onSinkTime,
    onDuration: (d: number) => {
      if (Number.isFinite(d) && d > 0) {
        player.duration = d;
        const t = pl.current;
        if (t && !t.duration) {
          t.duration = d;
          commit();
        }
        flushPendingResume();
      }
    },
    onEnded: onSinkEnded,
    onError: (err: PlayBlockError, details?: SinkErrorDetails | null) => {
      if (player.playSource === "none") return;
      if (!err.reason.startsWith("exclusive")) {
        emit(
          "sink.html.error",
          failCtx({
            reason: err.reason,
            media_code: details?.media_code ?? null,
            network_state: details?.network_state ?? null,
            ready_state: details?.ready_state ?? null,
          }),
          "error",
        );
      }
      failCurrentLoad({
        reason: err.reason,
        message: err.message,
        toast: err.reason.startsWith("exclusive") ? true : undefined,
      });
    },
    onPauseState: () => {
      syncTransportFlags();
      persistPausePosition();
    },
  };
  htmlSink.setHandlers(handlers);
  companionSink.setHandlers(handlers);
}

export function stopPlayback() {
  become("none");
  discardListen();
  setPlayNotice(null);
  nearEndPrepareSent = false;
  pl.index = -1;
  player.currentTime = 0;
  player.duration = 0;
  clearPlaybackPosition();
  commit();
  syncTransportFlags();
  updateMediaSession();
}

function maybePrepareNext() {
  if (nearEndPrepareSent) return;
  const sink = getActiveSink();
  const dur = sink.duration;
  if (!Number.isFinite(dur) || dur <= 0) return;
  const remaining = dur - (sink.currentTime || 0);
  if (remaining > PREPARE_LEAD_SECONDS) return;

  const nextIdx = pl.peekNextIndex();
  if (nextIdx < 0 || nextIdx === pl.index) {
    nearEndPrepareSent = true;
    return;
  }
  const nextTrack = pl.tracks[nextIdx];
  if (!nextTrack?.id) {
    nearEndPrepareSent = true;
    return;
  }
  if (!canReachServer()) return;

  nearEndPrepareSent = true;
  prepareTracks([nextTrack], { urgent: true, limit: 1 });
}

export async function playIndex(index: number) {
  become("queue");
  if (index < 0 || index >= pl.length) return;
  const cold = player.playSource === "none";
  const nextTrack = pl.tracks[index];
  const seekTo = cold
    ? resumeSeconds({
        trackId: nextTrack?.id,
        saved: readPlaybackPosition(),
        duration: nextTrack?.duration,
      })
    : null;
  if (seekTo == null) clearPlaybackPosition();
  const gen = beginLoad();
  pendingResume = seekTo != null ? { gen, seconds: seekTo } : null;
  pl.index = index;
  if (pl.shuffle) {
    pl.shufflePos = pl.shuffleOrder.indexOf(index);
  }
  const track = pl.current;
  emit(
    "player.load.begin",
    { track_id: track?.id ?? null, index },
    "info"
  );
  commit();
  nearEndPrepareSent = false;
  invalidateCoverCache();
  updateMediaSession();
  revokeLocalPlayUrl();
  setPlayNotice(null);

  await loadResolved(gen, track);
  if (still(gen)) flushPendingResume();
}

function queuePlayableOpts() {
  return {
    downloadsEnabled: downloads.enabled,
    canUseRemote: canUseRemoteMedia(),
  };
}

function shouldSkipUnplayableQueue() {
  return isOfflineUnplayable(undefined, queuePlayableOpts());
}

function stopAtQueueEnd() {
  try {
    getActiveSink().pause();
  } catch {
    /* ignore */
  }
  syncTransportFlags();
}

export function playNext() {
  const opts = queuePlayableOpts();
  const idx = shouldSkipUnplayableQueue()
    ? pl.advanceToPlayable("next", (t) => isPlayableNow(t, opts))
    : pl.nextIndex();
  if (idx < 0) {
    stopAtQueueEnd();
    return;
  }
  playIndex(idx);
}

export function playPrev() {
  const sink = getActiveSink();
  if (sink.currentTime > 3) {
    sink.seek(0);
    onListenRestart();
    return;
  }
  const opts = queuePlayableOpts();
  const idx = shouldSkipUnplayableQueue()
    ? pl.advanceToPlayable("prev", (t) => isPlayableNow(t, opts))
    : pl.prevIndex();
  if (idx < 0) {
    stopAtQueueEnd();
    return;
  }
  playIndex(idx);
}

function ensureAudible() {
  if (!pl.length) return;
  if (pl.index < 0) {
    playIndex(0);
    return;
  }
  if (
    player.playSource !== "streaming" &&
    player.playSource !== "downloaded"
  ) {
    playIndex(pl.index);
    return;
  }
  Promise.resolve(getActiveSink().resume()).catch(console.error);
}

export function togglePlay() {
  const sink = getActiveSink();
  if (!sink.paused) {
    sink.pause();
  } else {
    ensureAudible();
  }
  syncTransportFlags();
}

export function toggleShuffle() {
  pl.shuffle = !pl.shuffle;
  if (pl.shuffle) pl.rebuildShuffle();
  commit();
}

export function cycleRepeat() {
  if (pl.repeat === "off") pl.repeat = "all";
  else if (pl.repeat === "all") pl.repeat = "one";
  else pl.repeat = "off";
  commit();
}

export function seekToFraction(frac: number) {
  const sink = getActiveSink();
  const sinkDur = sink.duration;
  const dur =
    Number.isFinite(sinkDur) && sinkDur > 0 ? sinkDur : player.duration;
  if (!Number.isFinite(dur) || dur <= 0) return;
  const seconds = Math.max(0, frac * dur);
  if (player.playSource === "none") {
    player.currentTime = seconds;
    persistCurrentPosition();
    return;
  }
  sink.seek(seconds);
  onSinkTime(sink.currentTime, dur);
  if (sink.paused) persistCurrentPosition();
}

export function setVolume(v: number) {
  setOutputVolume(v);
}

export function applyVolume() {
  const stored = readVolume();
  if (stored != null) player.volume = stored;
  getActiveSink().setVolume(player.volume);
}

export function initAudioListeners() {
  watch(
    () => settings.streamCodec,
    () => {
      prepareTracks(pl.tracks, { replace: true });
      if (activeSession() !== "queue") return;
      if (pl.index >= 0) playIndex(pl.index);
    },
  );
  watch(
    () => settings.playbackPolicy,
    () => {
      prepareTracks(pl.tracks, { replace: true });
    },
  );
  watch(
    () => player.volume,
    (v) => {
      getActiveSink().setVolume(v);
    },
  );
  wireSinkHandlers();
  // Ensure html sink element is in the document for first non-exclusive play.
  selectSink("htmlAudio");
  getActiveSink().setVolume(player.volume);
  onLeaveQueue(() => {
    invalidateLoads();
    teardownOnDemandMedia();
  });
  installOnDemandMediaSession({
    play: () => {
      ensureAudible();
    },
    pause: () => getActiveSink().pause(),
    previous: playPrev,
    next: playNext,
    seekto: (details) => {
      const sink = getActiveSink();
      if (
        details.seekTime != null &&
        Number.isFinite(sink.duration) &&
        sink.duration > 0
      ) {
        sink.seek(details.seekTime);
        onSinkTime(sink.currentTime, sink.duration);
        if (sink.paused) persistCurrentPosition();
      }
    },
  });

  const persistOnHide = () => persistCurrentPosition();
  window.addEventListener("pagehide", persistOnHide);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") persistOnHide();
  });
}
