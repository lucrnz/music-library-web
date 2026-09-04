/**
 * Playback control + Media Session. Transport goes through the active sink
 * (htmlAudio or exclusive companion) — HTMLAudioElement is not exported.
 * Load/fail lives in playback/load.ts.
 */
import {
  canReachServer,
  canUseRemoteMedia,
  onConnectivityRecovered,
} from "@/connectivity";
import { emit } from "@/diag/log";
import { backfillTrack } from "@/downloads/backfill";
import { catalogIndex } from "@/downloads/catalog";
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
import { playTapAction } from "@/playback/playTap";
import {
  createQueueJoin,
  isHardJoinBlock,
  isNaturalEnded,
} from "@/playback/queueJoin";
import { prepareTracks } from "@/playback/prepare";
import {
  clearPlaybackPosition,
  readPlaybackPosition,
  resumeSeconds,
  writePlaybackPosition,
} from "@/stores/playbackPosition";
import {
  pl,
  commit,
  replaceQueue,
  type QueueEntry,
} from "@/stores/playlist";
import { setOutputVolume, subscribeOutputVolume } from "@/stores/playerPrefs";
import {
  invalidateCoverCache,
  updateMediaSession,
} from "@/stores/playerSession";
import { player, setPlayNotice } from "@/stores/playerState";
import { exclusiveAudio } from "@/stores/exclusiveAudio";
import { settings } from "@/stores/settings";
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

/** Pause once the in-flight load finishes. Initialized from resumePaused. */
let wantPaused = false;

/** Rejoin attempt in flight — playIndex must not reset the backoff clock. */
let rejoinAttempt = false;

/** Last hard block was offline_no_local; reconnect can retry this row. */
let healOffline = false;

const queueJoin = createQueueJoin(async () => {
  if (pl.index < 0) return;
  const resumeAt = player.currentTime > 0 ? player.currentTime : undefined;
  rejoinAttempt = true;
  try {
    await playIndex(pl.index, { resumeAt });
  } finally {
    rejoinAttempt = false;
  }
});

function applyTransportFlags() {
  const hold =
    pendingResume && still(pendingResume.gen) && pendingResume.seconds > 0
      ? pendingResume.seconds
      : null;
  syncTransportFlags();
  if (hold != null) player.currentTime = hold;
}

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
  const endedAt = sink.currentTime || player.currentTime;
  const endedDur = sink.duration || player.duration;
  if (pl.repeat === "one" || isNaturalEnded(endedAt, endedDur)) {
    queueJoin.cancel();
    if (pl.repeat === "one") {
      sink.seek(0);
      Promise.resolve(sink.resume()).catch(console.error);
      return;
    }
    clearPlaybackPosition();
    playNext();
    return;
  }
  if (queueJoin.holdPending) {
    persistCurrentPosition();
    player.loadPending = true;
    queueJoin.onFailedJoin();
    return;
  }
  clearPlaybackPosition();
  playNext();
}

function onSinkTime(t: number, d: number) {
  if (player.seeking) return;
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
      if (isHardJoinBlock(err.reason)) {
        queueJoin.cancel();
        if (err.reason === "offline_no_local") healOffline = true;
        failCurrentLoad({
          reason: err.reason,
          message: err.message,
          toast: err.reason.startsWith("exclusive") ? true : undefined,
        });
        return;
      }
      player.loadPending = true;
      queueJoin.onFailedJoin();
    },
    onPauseState: (paused: boolean) => {
      if (paused) {
        if (queueJoin.userPauseMarked) {
          queueJoin.onIntentionalPause();
          applyTransportFlags();
          persistPausePosition();
          return;
        }
        if (queueJoin.holdPending) {
          persistCurrentPosition();
          player.loadPending = true;
          queueJoin.onFailedJoin();
          applyTransportFlags();
          return;
        }
      }
      applyTransportFlags();
      persistPausePosition();
    },
  };
  htmlSink.setHandlers(handlers);
  companionSink.setHandlers(handlers);
}

export function stopPlayback() {
  queueJoin.cancel();
  become("none");
  setPlayNotice(null);
  nearEndPrepareSent = false;
  pendingResume = null;
  wantPaused = false;
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

function reloadCurrentQueueTrack() {
  if (activeSession() !== "queue") return;
  if (pl.index < 0) return;
  persistCurrentPosition();
  void playIndex(pl.index, {
    resumeAt: player.currentTime,
    resumePaused: getActiveSink().paused,
  });
}

/** Replace the queue with `entries` and start the first track at 0. */
export async function playAllTracks(
  entries: Array<QueueEntry | null | undefined> | null | undefined,
) {
  clearPlaybackPosition();
  if (await replaceQueue(entries)) playIndex(0);
}

export async function playIndex(
  index: number,
  opts?: { resumeAt?: number; resumePaused?: boolean },
) {
  if (!rejoinAttempt) queueJoin.cancel();
  become("queue");
  if (index < 0 || index >= pl.length) return;
  const cold = player.playSource === "none";
  const nextTrack = pl.tracks[index];
  const keepAt = opts?.resumeAt;
  const seekTo =
    keepAt != null && Number.isFinite(keepAt) && keepAt > 0
      ? keepAt
      : cold
        ? resumeSeconds({
            trackId: nextTrack?.id,
            saved: readPlaybackPosition(),
            duration: nextTrack?.duration,
          })
        : null;
  if (seekTo == null && keepAt == null) clearPlaybackPosition();
  wantPaused = opts?.resumePaused === true;
  const gen = beginLoad();
  pendingResume = seekTo != null ? { gen, seconds: seekTo } : null;
  player.currentTime = seekTo != null && seekTo > 0 ? seekTo : 0;
  pl.index = index;
  if (pl.shuffle) {
    pl.shufflePos = pl.shuffleOrder.indexOf(index);
  }
  const track = pl.current;
  if (downloads.enabled && track?.id && catalogIndex.byTrack[track.id]) {
    void backfillTrack(track.id);
  }
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

  const loaded = await loadResolved(gen, track);
  if (!still(gen)) return;
  if (!loaded.ok && loaded.retryable) {
    if (wantPaused) {
      queueJoin.onIntentionalPause();
      try {
        getActiveSink().pause();
      } catch {
        /* ignore */
      }
      player.loadPending = false;
      return;
    }
    player.loadPending = true;
    queueJoin.onFailedJoin();
    return;
  }
  if (player.playBlockReason === "offline_no_local") healOffline = true;
  if (
    still(gen) &&
    pendingResume &&
    still(pendingResume.gen) &&
    pendingResume.seconds > 0
  ) {
    player.currentTime = pendingResume.seconds;
  }
  if (still(gen) && wantPaused) {
    queueJoin.onIntentionalPause();
    try {
      getActiveSink().pause();
    } catch {
      /* ignore */
    }
  } else if (
    still(gen) &&
    (player.playSource === "streaming" || player.playSource === "downloaded")
  ) {
    healOffline = false;
    queueJoin.onPlaySucceeded();
  }
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
  applyTransportFlags();
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
  const action = playTapAction({
    hasTracks: pl.length > 0,
    index: pl.index,
    loadInFlight: player.loadPending,
    playSource: player.playSource,
  });
  if (action === "noop") return;
  if (action === "flip-want") {
    wantPaused = !wantPaused;
    return;
  }
  if (action === "start-first") {
    playIndex(0);
    return;
  }
  if (action === "resume") {
    Promise.resolve(getActiveSink().resume()).catch(console.error);
    return;
  }
  const track = pl.current ?? pl.tracks[pl.index];
  const at =
    player.currentTime > 0
      ? player.currentTime
      : resumeSeconds({
          trackId: track?.id,
          saved: readPlaybackPosition(),
          duration: track?.duration,
        });
  playIndex(pl.index, { resumeAt: at ?? undefined });
}

export function togglePlay() {
  if (player.loadPending) {
    if (!wantPaused) {
      queueJoin.markUserPause();
      wantPaused = true;
      queueJoin.onIntentionalPause();
    } else {
      wantPaused = false;
    }
    return;
  }
  const sink = getActiveSink();
  if (!sink.paused) {
    queueJoin.markUserPause();
    sink.pause();
  } else {
    ensureAudible();
  }
  applyTransportFlags();
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

export function initAudioListeners() {
  watch(
    () => settings.streamCodec,
    () => {
      prepareTracks(pl.tracks, { replace: true });
      reloadCurrentQueueTrack();
    },
  );
  watch(
    () => settings.playbackPolicy,
    () => {
      prepareTracks(pl.tracks, { replace: true });
    },
  );
  watch(
    () => exclusiveAudio.enabled,
    () => {
      prepareTracks(pl.tracks, { replace: true });
      reloadCurrentQueueTrack();
    },
  );
  wireSinkHandlers();
  // Ensure html sink element is in the document for first non-exclusive play.
  selectSink("htmlAudio");
  subscribeOutputVolume((v) => getActiveSink().setVolume(v));
  onLeaveQueue(() => {
    queueJoin.cancel();
    invalidateLoads();
    teardownOnDemandMedia();
  });
  onConnectivityRecovered(() => {
    if (activeSession() !== "queue") return;
    if (wantPaused) return;
    const unfinished =
      player.loadPending || queueJoin.holdPending || queueJoin.rejoinActive;
    if (!unfinished && !healOffline) return;
    healOffline = false;
    queueJoin.kick();
  });
  installOnDemandMediaSession({
    play: () => {
      ensureAudible();
    },
    pause: () => {
      queueJoin.markUserPause();
      if (player.loadPending) {
        wantPaused = true;
        queueJoin.onIntentionalPause();
        return;
      }
      getActiveSink().pause();
    },
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
