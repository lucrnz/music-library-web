/**
 * Playback control + Media Session. Transport goes through the active sink
 * (htmlAudio or exclusive companion) — HTMLAudioElement is not exported.
 */
import {
  canReachServer,
  canUseRemoteMedia,
  getConnectivityState,
} from "@/connectivity";
import { beginPlay, emit } from "@/diag/log";
import { isLocallyPlayableDownload } from "@/downloads/catalog";
import { markDownloadBroken } from "@/downloads/index";
import { downloads } from "@/downloads/state";
import { createCompanionSink } from "@/playback/sinks/companionSink";
import { createHtmlAudioSink } from "@/playback/sinks/htmlAudioSink";
import type { PlaybackSink, SinkErrorDetails } from "@/playback/sinks/types";
import { ensurePreferredDevice } from "@/exclusive/companionClient";
import { supportsCodecKind } from "@/codecSupport";
import { SOURCE_TAG, deliveryCodec } from "@/lossyKind";
import type { Track } from "@/models/track";
import { PLAY_BLOCK_MESSAGES, type PlayBlockReason } from "@/playBlock";
import {
  resolvePlayIntent,
  type PlayIntent,
} from "@/playback/playIntent";
import { prepareTracks } from "@/playback/prepare";
import { showToast } from "@/stores/ui";
import {
  consumeMissingTechToast,
  getExclusiveProfileTag,
  isExclusiveEnabled,
} from "@/stores/exclusiveAudio";
import {
  clearPlaybackPosition,
  readPlaybackPosition,
  resumeSeconds,
  writePlaybackPosition,
} from "@/stores/playbackPosition";
import { pl, commit } from "@/stores/playlist";
import { readVolume, writeVolume } from "@/stores/playerPrefs";
import {
  invalidateCoverCache,
  updateMediaSession,
} from "@/stores/playerSession";
import {
  clearPlaySourceState,
  player,
  setPlayNotice,
  setPlaySourceState,
} from "@/stores/playerState";
import { getActiveStreamCodec, openSettings, settings } from "@/stores/settings";
import {
  discard as discardListen,
  onEnded as onListenEnded,
  onRestart as onListenRestart,
  onTime as onListenTime,
  startCycle as startListenCycle,
} from "@/listens/bridge";
import {
  bindOnDemandControl,
  claimOnDemand,
  installOnDemandMediaSession,
} from "@/playback/onDemandControl";

export { player };

/** Seconds before end to urgent-prepare the next queue track (once per load). */
const PREPARE_LEAD_SECONDS = 15;

const htmlSink = createHtmlAudioSink();
const companionSink = createCompanionSink();

let activeSink: PlaybackSink = htmlSink;

/** blob: URL we must revoke */
let localPlayUrl: string | null = null;

/**
 * Near-end prepare already fired (or permanently no next) for this playIndex
 * load. Not reset on seek/scrub. Offline does not latch — reconnect can still
 * prepare once while still in the lead window.
 */
let nearEndPrepareSent = false;

/** Current playIndex / stopPlayback load generation (stale-await guard). */
let playGen = 0;

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
  if (!activeSink.paused) return;
  persistCurrentPosition();
}

function flushPendingResume() {
  if (!pendingResume || pendingResume.gen !== playGen) {
    pendingResume = null;
    return;
  }
  if (player.playSource !== "streaming" && player.playSource !== "downloaded") {
    return;
  }
  const dur = activeSink.duration;
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
  if (seconds != null && seconds > 0) activeSink.seek(seconds);
  player.currentTime = activeSink.currentTime || 0;
  if (Number.isFinite(dur) && dur > 0) player.duration = dur;
  updatePositionState();
}

function failCtx(extra?: Record<string, unknown> | null): Record<string, unknown> {
  return {
    track_id: pl.current?.id ?? null,
    play_source: player.playSource,
    profile: player.playProfileId,
    reason: extra?.reason ?? player.playBlockReason,
    connectivity: getConnectivityState(),
    ...(extra && typeof extra === "object" ? extra : {}),
  };
}

function beginLoad() {
  playGen += 1;
  discardListen();
  beginPlay();
  clearPlaySourceState();
  try {
    htmlSink.stop();
  } catch {
    /* ignore */
  }
  return playGen;
}

function still(gen: number) {
  return gen === playGen;
}

function invalidateLoads() {
  playGen += 1;
}

function applyIntent(intent: PlayIntent) {
  if (intent.source === "unavailable") {
    setPlaySourceState("unavailable", intent.profile, intent.block);
    emit(
      "player.unavailable",
      failCtx({ reason: intent.block }),
      "error",
    );
    return;
  }
  setPlaySourceState(intent.source, intent.profile, null);
  emit(
    "player.resolve",
    { type: intent.source, profile: intent.profile },
    "info",
  );
}

/**
 * Mark the current load unavailable and set the user-visible notice.
 */
function failPlayback(
  profileId: string | null | undefined,
  reason: PlayBlockReason,
  notice: string | null | undefined,
) {
  setPlaySourceState("unavailable", profileId || null, reason);
  setPlayNotice(notice);
  emit(
    "player.load.fail",
    failCtx({ reason, message: notice || null }),
    "error"
  );
}

const msSupported = "mediaSession" in navigator;

function revokeLocalPlayUrl() {
  if (localPlayUrl) {
    URL.revokeObjectURL(localPlayUrl);
    localPlayUrl = null;
  }
}

function selectSink(kind: "htmlAudio" | "companion") {
  const next = kind === "companion" ? companionSink : htmlSink;
  if (next === activeSink) return;
  try {
    activeSink.stop();
  } catch {
    /* ignore */
  }
  activeSink = next;
  activeSink.setVolume(player.volume);
}

function updatePositionState() {
  if (
    !msSupported ||
    typeof navigator.mediaSession.setPositionState !== "function"
  ) {
    return;
  }
  const dur = activeSink.duration;
  if (!Number.isFinite(dur) || dur <= 0) return;
  try {
    navigator.mediaSession.setPositionState({
      duration: dur,
      playbackRate: activeSink.playbackRate || 1,
      position: Math.min(activeSink.currentTime, dur),
    });
  } catch {
    /* ignore */
  }
}

function syncTransportFlags() {
  player.paused = activeSink.paused;
  player.currentTime = activeSink.currentTime || 0;
  player.duration = Number.isFinite(activeSink.duration)
    ? activeSink.duration
    : 0;
  if (msSupported) {
    navigator.mediaSession.playbackState =
      pl.index >= 0 ? (activeSink.paused ? "paused" : "playing") : "none";
  }
}

function hardStopCompanion(
  message: string | null | undefined,
  reason: PlayBlockReason = "exclusive_failed",
  opts: { openSettings?: boolean } = {},
) {
  try {
    activeSink.stop();
  } catch {
    /* ignore */
  }
  const r = reason || "exclusive_failed";
  const notice =
    message ||
    PLAY_BLOCK_MESSAGES[r] ||
    PLAY_BLOCK_MESSAGES.exclusive_failed;
  failPlayback(player.playProfileId, r, notice);
  showToast(notice);
  if (opts.openSettings || r === "exclusive_needs_device") {
    openSettings();
  }
  syncTransportFlags();
}

/**
 * Sink ended → single advance owner (repeat-one / playNext).
 */
function onSinkEnded() {
  if (player.playSource === "none") return;
  onListenEnded();
  if (pl.repeat === "one") {
    activeSink.seek(0);
    Promise.resolve(activeSink.resume()).catch(console.error);
    onListenRestart();
    return;
  }
  clearPlaybackPosition();
  playNext();
}

function maybeStartListenCycle(track: Track | null | undefined) {
  const source = player.playSource;
  const profile = player.playProfileId;
  if ((source !== "streaming" && source !== "downloaded") || !profile) return;
  if (!track?.id) return;
  startListenCycle({
    trackId: track.id,
    durationSec: track.duration,
    profile,
    playSource: source,
  });
}

function onSinkTime(t: number, d: number) {
  if (player.seeking) return;
  onListenTime({
    currentTime: t,
    duration: d,
    playing: !activeSink.paused,
  });
  if (Number.isFinite(d) && d > 0) player.duration = d;
  if (pendingResume && pendingResume.gen === playGen) {
    flushPendingResume();
    return;
  }
  player.currentTime = t || 0;
  updatePositionState();
  maybePrepareNext();
}

function errorField(err: unknown, key: "name" | "message"): unknown {
  if (err && typeof err === "object" && key in err) {
    return (err as Record<string, unknown>)[key];
  }
  return undefined;
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
    onError: (
      message: string,
      code?: string | null,
      details?: SinkErrorDetails | null,
    ) => {
      if (code === "exclusive_needs_device") {
        if (player.playSource === "none") {
          if (pl.index < 0) {
            showToast(
              message || PLAY_BLOCK_MESSAGES.exclusive_needs_device
            );
            openSettings();
          }
          return;
        }
        hardStopCompanion(
          message || PLAY_BLOCK_MESSAGES.exclusive_needs_device,
          "exclusive_needs_device",
          { openSettings: true }
        );
        return;
      }
      if (player.playSource === "none") return;
      if (activeSink.kind === "companion" || isExclusiveEnabled()) {
        hardStopCompanion(message, "exclusive_failed");
        return;
      }
      emit(
        "sink.html.error",
        failCtx({
          reason: "play_failed",
          media_code: details?.media_code ?? null,
          network_state: details?.network_state ?? null,
          ready_state: details?.ready_state ?? null,
        }),
        "error"
      );
      failPlayback(
        player.playProfileId,
        "play_failed",
        message || PLAY_BLOCK_MESSAGES.play_failed
      );
      syncTransportFlags();
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
  claimOnDemand();
  invalidateLoads();
  discardListen();
  clearPlaySourceState();
  try {
    activeSink.stop();
  } catch {
    /* ignore */
  }
  if (activeSink !== htmlSink) {
    try {
      htmlSink.stop();
    } catch {
      /* ignore */
    }
  }
  revokeLocalPlayUrl();
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
  const dur = activeSink.duration;
  if (!Number.isFinite(dur) || dur <= 0) return;
  const remaining = dur - (activeSink.currentTime || 0);
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
  void issueNearEndPrepare(nextTrack);
}

async function issueNearEndPrepare(nextTrack: Track) {
  prepareTracks([nextTrack], { urgent: true, limit: 1 });
}

async function attemptPlay(
  url: string,
  gen: number,
): Promise<{ ok: true } | { ok: false; err: unknown }> {
  if (!still(gen)) return { ok: false, err: undefined };
  try {
    await activeSink.load(url);
    return { ok: true };
  } catch (err: unknown) {
    if (activeSink.kind === "htmlAudio") {
      emit(
        "sink.html.play_reject",
        failCtx({
          name: errorField(err, "name") ? errorField(err, "name") : null,
          message: errorField(err, "message")
            ? errorField(err, "message")
            : String(err ?? ""),
        }),
        "error"
      );
    }
    return { ok: false, err };
  }
}

async function sourceKindSupported(track: Track | null | undefined) {
  const kind = (track?.sourceCodec || "").toLowerCase();
  return (kind === "mp3" || kind === "aac") && (await supportsCodecKind(kind));
}

async function intentForTrack(
  track: Track | null | undefined,
  gen: number,
  extra: { localBroken?: boolean } = {},
): Promise<PlayIntent | null> {
  const exclusive = isExclusiveEnabled();
  let exclusiveGate: { ok: boolean; reason?: string } | undefined;
  if (exclusive && !track?.isLossy) {
    exclusiveGate = await ensurePreferredDevice({ timeoutMs: 1500 });
    if (!still(gen)) return null;
  }
  const activeCodec =
    deliveryCodec(track, getActiveStreamCodec()) || getActiveStreamCodec();
  let sourceOk: boolean | undefined;
  if (!exclusive && activeCodec === SOURCE_TAG) {
    sourceOk = await sourceKindSupported(track);
    if (!still(gen)) return null;
  }
  return resolvePlayIntent(track, {
    exclusiveEnabled: exclusive,
    exclusiveTag: exclusive ? getExclusiveProfileTag(track) : null,
    exclusiveGate,
    enabled: downloads.enabled,
    offline: !canUseRemoteMedia(),
    activeStreamCodec: getActiveStreamCodec(),
    playbackPolicy: settings.playbackPolicy,
    catalog: settings.options,
    localBroken: extra.localBroken,
    sourceKindSupported: sourceOk,
    absoluteStream: exclusive,
  });
}

async function loadIntent(
  gen: number,
  track: Track | null | undefined,
  intent: PlayIntent,
) {
  applyIntent(intent);
  if (intent.source === "unavailable") {
    const title = track?.title || "Track";
    const exclusive = intent.block.startsWith("exclusive");
    const notice = exclusive
      ? intent.message
      : intent.message
        ? `${title}: ${intent.message}`
        : intent.message;
    setPlayNotice(notice);
    if (exclusive) {
      showToast(intent.message || PLAY_BLOCK_MESSAGES.exclusive_failed);
      if (intent.block === "exclusive_needs_device") openSettings();
    }
    syncTransportFlags();
    return;
  }

  if (
    intent.sink === "companion" &&
    (track?.sampleRateHz == null || track?.bitDepth == null) &&
    track?.id &&
    consumeMissingTechToast(track.id)
  ) {
    showToast(
      `${track.title || "Track"}: source format unknown — using device max`,
    );
  }

  selectSink(intent.sink);
  player.playNotice = null;
  if (intent.source === "downloaded") {
    localPlayUrl = intent.url;
  }

  let result = await attemptPlay(intent.url, gen);
  if (!still(gen)) return;
  if (!result.ok && intent.source === "downloaded") {
    console.warn("Local playback failed, falling back to stream", result.err);
    if (track?.id) markDownloadBroken(track.id).catch(() => {});
    revokeLocalPlayUrl();
    const retry = await intentForTrack(track, gen, { localBroken: true });
    if (!retry || !still(gen)) return;
    applyIntent(retry);
    if (retry.source === "unavailable") {
      const title = track?.title || "Track";
      setPlayNotice(retry.message ? `${title}: ${retry.message}` : retry.message);
      syncTransportFlags();
      return;
    }
    result = await attemptPlay(retry.url, gen);
    if (!still(gen)) return;
    if (!result.ok) {
      console.error("Playback failed", result.err);
      failPlayback(
        retry.profile,
        "play_failed",
        PLAY_BLOCK_MESSAGES.play_failed,
      );
    }
  } else if (!result.ok) {
    if (intent.sink === "companion") {
      console.error("Exclusive playback failed", result.err);
      hardStopCompanion(
        result.err instanceof Error
          ? result.err.message
          : PLAY_BLOCK_MESSAGES.exclusive_failed,
        "exclusive_failed",
      );
      return;
    }
    console.error("Playback failed", result.err);
    failPlayback(
      intent.profile,
      "play_failed",
      PLAY_BLOCK_MESSAGES.play_failed,
    );
  }
  if (still(gen) && result.ok) {
    emit(
      "player.load.ok",
      { play_source: player.playSource, profile: player.playProfileId },
      "info",
    );
    maybeStartListenCycle(track);
  }
  syncTransportFlags();
}

export async function playIndex(index: number) {
  claimOnDemand();
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

  const intent = await intentForTrack(track, gen);
  if (!still(gen) || !intent) return;
  await loadIntent(gen, track, intent);
  if (still(gen)) flushPendingResume();
}

function shouldSkipUnplayableQueue() {
  return downloads.enabled && !canUseRemoteMedia();
}

function stopAtQueueEnd() {
  try {
    activeSink.pause();
  } catch {
    /* ignore */
  }
  syncTransportFlags();
}

export function playNext() {
  const idx = shouldSkipUnplayableQueue()
    ? pl.advanceToPlayable("next", (t) => !!t?.id && isLocallyPlayableDownload(t.id))
    : pl.nextIndex();
  if (idx < 0) {
    stopAtQueueEnd();
    return;
  }
  playIndex(idx);
}

export function playPrev() {
  if (activeSink.currentTime > 3) {
    activeSink.seek(0);
    onListenRestart();
    return;
  }
  const idx = shouldSkipUnplayableQueue()
    ? pl.advanceToPlayable("prev", (t) => !!t?.id && isLocallyPlayableDownload(t.id))
    : pl.prevIndex(0);
  if (typeof idx !== "number" || idx < 0) {
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
  Promise.resolve(activeSink.resume()).catch(console.error);
}

export function togglePlay() {
  if (!activeSink.paused) {
    activeSink.pause();
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
  const sinkDur = activeSink.duration;
  const dur =
    Number.isFinite(sinkDur) && sinkDur > 0 ? sinkDur : player.duration;
  if (!Number.isFinite(dur) || dur <= 0) return;
  const seconds = Math.max(0, frac * dur);
  if (player.playSource === "none") {
    player.currentTime = seconds;
    persistCurrentPosition();
    return;
  }
  activeSink.seek(seconds);
  onSinkTime(activeSink.currentTime, dur);
  if (activeSink.paused) persistCurrentPosition();
}

export function setVolume(v: number) {
  const n = Math.min(1, Math.max(0, Number(v)));
  player.volume = n;
  activeSink.setVolume(n);
  writeVolume(n);
}

export function applyVolume() {
  const stored = readVolume();
  if (stored != null) player.volume = stored;
  activeSink.setVolume(player.volume);
}

export function initAudioListeners() {
  wireSinkHandlers();
  // Ensure html sink element is in the document for first non-exclusive play.
  selectSink("htmlAudio");
  activeSink.setVolume(player.volume);
  bindOnDemandControl({
    bumpLoadGeneration: invalidateLoads,
    stopSinks: () => {
      try {
        htmlSink.stop();
      } catch {
        /* ignore */
      }
      try {
        companionSink.stop();
      } catch {
        /* ignore */
      }
    },
  });
  installOnDemandMediaSession({
    play: () => {
      ensureAudible();
    },
    pause: () => activeSink.pause(),
    previous: playPrev,
    next: playNext,
    seekto: (details) => {
      if (
        details.seekTime != null &&
        Number.isFinite(activeSink.duration) &&
        activeSink.duration > 0
      ) {
        activeSink.seek(details.seekTime);
        onSinkTime(activeSink.currentTime, activeSink.duration);
        if (activeSink.paused) persistCurrentPosition();
      }
    },
  });

  const persistOnHide = () => persistCurrentPosition();
  window.addEventListener("pagehide", persistOnHide);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") persistOnHide();
  });
}
