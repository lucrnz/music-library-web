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
import { supportsCodecKind } from "@/codecSupport";
import { SOURCE_TAG, deliveryCodec } from "@/lossyKind";
import type { Track } from "@/models/track";
import { PLAY_BLOCK_MESSAGES, type PlayBlockReason } from "@/playBlock";
import {
  needsCompanionStop,
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
import { readVolume, setOutputVolume } from "@/stores/playerPrefs";
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
  activeSession,
  become,
  installOnDemandMediaSession,
  onLeaveQueue,
} from "@/playback/session";
import { watch } from "vue";

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

function failNotice(opts: {
  reason: PlayBlockReason;
  message?: string | null;
  toast?: boolean | string;
}) {
  const reason = opts.reason || "exclusive_failed";
  const exclusive = reason.startsWith("exclusive");
  const rawNotice =
    opts.message ||
    PLAY_BLOCK_MESSAGES[reason] ||
    PLAY_BLOCK_MESSAGES.exclusive_failed;
  if (exclusive) {
    try {
      activeSink.stop();
    } catch {
      /* ignore */
    }
  }
  setPlayNotice(rawNotice);
  if (opts.toast) {
    showToast(typeof opts.toast === "string" ? opts.toast : rawNotice);
  }
  if (reason === "exclusive_needs_device") {
    openSettings();
  }
  syncTransportFlags();
}

function failCurrentLoad(opts: {
  reason: PlayBlockReason;
  message?: string | null;
  toast?: boolean | string;
}) {
  const reason = opts.reason || "exclusive_failed";
  const message =
    opts.message ||
    PLAY_BLOCK_MESSAGES[reason] ||
    PLAY_BLOCK_MESSAGES.exclusive_failed;
  applyIntent({
    source: "unavailable",
    profile: player.playProfileId ?? null,
    block: reason,
    message,
  });
  emit(
    "player.load.fail",
    failCtx({ reason, message: message || null }),
    "error",
  );
  failNotice({ reason, message, toast: opts.toast });
}

const msSupported = "mediaSession" in navigator;

function revokeLocalPlayUrl() {
  if (localPlayUrl) {
    URL.revokeObjectURL(localPlayUrl);
    localPlayUrl = null;
  }
}

function stopSink(sink: PlaybackSink) {
  try {
    sink.stop();
  } catch {
    /* ignore */
  }
}

/** Leave on-demand media: both sinks + revoke the local blob. */
function teardownOnDemandMedia() {
  stopSink(htmlSink);
  stopSink(companionSink);
  revokeLocalPlayUrl();
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
      if (player.playSource === "none") return;
      if (code === "exclusive_needs_device") {
        failCurrentLoad({
          reason: "exclusive_needs_device",
          message: message || PLAY_BLOCK_MESSAGES.exclusive_needs_device,
          toast: true,
        });
        return;
      }
      if (activeSink.kind === "companion") {
        failCurrentLoad({
          reason: "exclusive_failed",
          message,
          toast: true,
        });
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
      failCurrentLoad({
        reason: "play_failed",
        message: message || PLAY_BLOCK_MESSAGES.play_failed,
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
    enabled: downloads.enabled,
    offline: !canUseRemoteMedia(),
    activeStreamCodec: getActiveStreamCodec(),
    playbackPolicy: settings.playbackPolicy,
    catalog: settings.options,
    localBroken: extra.localBroken,
    sourceKindSupported: sourceOk,
  });
}

async function loadResolved(
  gen: number,
  track: Track | null | undefined,
  extra: { localBroken?: boolean } = {},
) {
  const intent = await intentForTrack(track, gen, extra);
  if (!still(gen) || !intent) return;
  applyIntent(intent);
  if (needsCompanionStop(intent, activeSink.kind)) {
    stopSink(companionSink);
    revokeLocalPlayUrl();
  }
  if (intent.source === "unavailable") {
    const exclusive = intent.block.startsWith("exclusive");
    const raw = intent.message || PLAY_BLOCK_MESSAGES[intent.block];
    failNotice({
      reason: intent.block,
      message: exclusive ? raw : `${track?.title || "Track"}: ${raw}`,
      toast: exclusive
        ? intent.message || PLAY_BLOCK_MESSAGES.exclusive_failed
        : false,
    });
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

  const result = await attemptPlay(intent.url, gen);
  if (!still(gen)) return;
  if (!result.ok && intent.source === "downloaded" && !extra.localBroken) {
    console.warn("Local playback failed, falling back to stream", result.err);
    if (track?.id) markDownloadBroken(track.id).catch(() => {});
    revokeLocalPlayUrl();
    return loadResolved(gen, track, { localBroken: true });
  }
  if (!result.ok) {
    const err = result.err;
    const code =
      err && typeof err === "object" && "code" in err
        ? (err as { code?: unknown }).code
        : undefined;
    const companion =
      intent.sink === "companion" || activeSink.kind === "companion";
    if (companion) {
      console.error("Exclusive playback failed", err);
      const reason =
        typeof code === "string" && code in PLAY_BLOCK_MESSAGES
          ? (code as PlayBlockReason)
          : "exclusive_failed";
      failCurrentLoad({
        reason,
        message:
          err instanceof Error
            ? err.message
            : PLAY_BLOCK_MESSAGES.exclusive_failed,
        toast: true,
      });
      return;
    }
    console.error("Playback failed", err);
    failCurrentLoad({
      reason: "play_failed",
      message: PLAY_BLOCK_MESSAGES.play_failed,
    });
    return;
  }
  emit(
    "player.load.ok",
    { play_source: player.playSource, profile: player.playProfileId },
    "info",
  );
  maybeStartListenCycle(track);
  syncTransportFlags();
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
  setOutputVolume(v);
  activeSink.setVolume(player.volume);
}

export function applyVolume() {
  const stored = readVolume();
  if (stored != null) player.volume = stored;
  activeSink.setVolume(player.volume);
}

export function initAudioListeners() {
  watch(
    () => settings.streamCodec,
    () => {
      if (activeSession() !== "queue") return;
      if (pl.index >= 0) playIndex(pl.index);
    },
  );
  wireSinkHandlers();
  // Ensure html sink element is in the document for first non-exclusive play.
  selectSink("htmlAudio");
  activeSink.setVolume(player.volume);
  onLeaveQueue(() => {
    invalidateLoads();
    teardownOnDemandMedia();
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
