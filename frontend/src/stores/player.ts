/**
 * Playback control + Media Session. Transport goes through the active sink
 * (htmlAudio or exclusive companion) — HTMLAudioElement is not exported.
 */
import { requestPrepare, streamUrl } from "@/api";
import {
  canReachServer,
  canUseRemoteMedia,
  getConnectivityState,
} from "@/connectivity";
import { beginPlay, emit } from "@/diag/log";
import { isLocallyPlayableDownload } from "@/downloads/catalog";
import { markDownloadBroken } from "@/downloads/index";
import { resolvePlaySource, type PlaySource } from "@/downloads/resolve";
import { downloads } from "@/downloads/state";
import { createCompanionSink } from "@/playback/sinks/companionSink";
import { createHtmlAudioSink } from "@/playback/sinks/htmlAudioSink";
import type { PlaybackSink, SinkErrorDetails } from "@/playback/sinks/types";
import { ensurePreferredDevice } from "@/exclusive/companionClient";
import { supportsCodecKind } from "@/codecSupport";
import { SOURCE_TAG, deliveryCodec } from "@/lossyKind";
import type { Track } from "@/models/track";
import { PLAY_BLOCK_MESSAGES, type PlayBlockReason } from "@/playBlock";
import { showToast } from "@/stores/ui";
import {
  consumeMissingTechToast,
  getExclusiveProfileTag,
  isExclusiveEnabled,
} from "@/stores/exclusiveAudio";
import { pl, commit, trackNeedsStreamPrepare } from "@/stores/playlist";
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

/**
 * Apply resolvePlaySource result onto player face state (same vocabulary).
 */
function applyResolvedSource(
  source: PlaySource,
  activeCodec: string | null | undefined,
) {
  if (source.type === "unavailable") {
    setPlaySourceState(
      "unavailable",
      source.codec || activeCodec || null,
      source.reason || "missing"
    );
    emit(
      "player.unavailable",
      failCtx({ reason: source.reason || "missing" }),
      "error"
    );
    return;
  }
  if (source.type === "downloaded") {
    setPlaySourceState("downloaded", source.codec || null, null);
  } else {
    setPlaySourceState(
      "streaming",
      source.codec || activeCodec || null,
      null
    );
  }
  emit(
    "player.resolve",
    { type: source.type, profile: source.codec || activeCodec || null },
    "info"
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
  if (pl.repeat === "one") {
    activeSink.seek(0);
    Promise.resolve(activeSink.resume()).catch(console.error);
    return;
  }
  playNext();
}

function onSinkTime(t: number, d: number) {
  if (player.seeking) return;
  player.currentTime = t || 0;
  if (Number.isFinite(d) && d > 0) player.duration = d;
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
    },
  };
  htmlSink.setHandlers(handlers);
  companionSink.setHandlers(handlers);
}

export function stopPlayback() {
  invalidateLoads();
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
  if (isExclusiveEnabled()) {
    const tag = getExclusiveProfileTag(nextTrack);
    if (!tag) return;
    requestPrepare([nextTrack], tag, { urgent: true });
    return;
  }
  const activeCodec = getActiveStreamCodec();
  if (!trackNeedsStreamPrepare(nextTrack, activeCodec)) return;
  requestPrepare([nextTrack], activeCodec, { urgent: true });
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

/**
 * Absolute stream URL for companion (must hit the browser's origin host).
 */
function absoluteStreamUrl(track: Track | null | undefined, tag: string) {
  const path = streamUrl(track, tag);
  if (!path) return null;
  try {
    return new URL(path, location.origin).href;
  } catch {
    return null;
  }
}

async function playExclusive(gen: number, track: Track | null | undefined) {
  if (track?.isLossy) {
    const notice = PLAY_BLOCK_MESSAGES.exclusive_lossy;
    failPlayback(null, "exclusive_lossy", notice);
    showToast(notice);
    syncTransportFlags();
    return;
  }
  const gate = await ensurePreferredDevice({ timeoutMs: 1500 });
  if (!still(gen)) return;
  if (!gate.ok) {
    selectSink("htmlAudio");
    const reason = gate.reason || "exclusive_not_ready";
    const notice =
      PLAY_BLOCK_MESSAGES[reason] || PLAY_BLOCK_MESSAGES.exclusive_not_ready;
    failPlayback(null, reason, notice);
    showToast(notice);
    if (reason === "exclusive_needs_device") {
      openSettings();
    }
    syncTransportFlags();
    return;
  }

  const tag = getExclusiveProfileTag(track);
  if (!tag) {
    selectSink("companion");
    failPlayback(
      null,
      "exclusive_no_format",
      PLAY_BLOCK_MESSAGES.exclusive_no_format
    );
    showToast(PLAY_BLOCK_MESSAGES.exclusive_no_format);
    syncTransportFlags();
    return;
  }

  if (
    (track?.sampleRateHz == null || track?.bitDepth == null) &&
    track?.id &&
    consumeMissingTechToast(track.id)
  ) {
    showToast(
      `${track.title || "Track"}: source format unknown — using device max`
    );
  }

  const url = absoluteStreamUrl(track, tag);
  if (!url) {
    failPlayback(tag, "play_failed", PLAY_BLOCK_MESSAGES.play_failed);
    syncTransportFlags();
    return;
  }

  selectSink("companion");
  setPlaySourceState("streaming", tag, null);
  player.playNotice = null;
  const result = await attemptPlay(url, gen);
  if (!still(gen)) return;
  if (!result.ok) {
    console.error("Exclusive playback failed", result.err);
    hardStopCompanion(
      result.err instanceof Error
        ? result.err.message
        : PLAY_BLOCK_MESSAGES.exclusive_failed,
      "exclusive_failed"
    );
    return;
  }
  syncTransportFlags();
}

async function playHtml(gen: number, track: Track | null | undefined) {
  selectSink("htmlAudio");
  const activeCodec =
    deliveryCodec(track, getActiveStreamCodec()) || getActiveStreamCodec();
  if (activeCodec === SOURCE_TAG) {
    const kind = (track?.sourceCodec || "").toLowerCase();
    const ok =
      (kind === "mp3" || kind === "aac") && (await supportsCodecKind(kind));
    if (!still(gen)) return;
    if (!ok) {
      failPlayback(
        SOURCE_TAG,
        "codec_unsupported",
        PLAY_BLOCK_MESSAGES.codec_unsupported
      );
      syncTransportFlags();
      return;
    }
  }
  const source = await resolvePlaySource(track, {
    enabled: downloads.enabled,
    activeStreamCodec: activeCodec,
    playbackPolicy: settings.playbackPolicy,
    catalog: settings.options,
    offline: !canUseRemoteMedia(),
  });
  if (!still(gen)) return;

  applyResolvedSource(source, activeCodec);

  if (source.type === "unavailable") {
    const title = track?.title || "Track";
    setPlayNotice(source.message ? `${title}: ${source.message}` : source.message);
    syncTransportFlags();
    return;
  }

  if (source.type === "downloaded") {
    localPlayUrl = source.url;
  }

  let result = await attemptPlay(source.url, gen);
  if (!still(gen)) return;
  if (!result.ok && source.type === "downloaded") {
    console.warn("Local playback failed, falling back to stream", result.err);
    if (track?.id) markDownloadBroken(track.id).catch(() => {});
    revokeLocalPlayUrl();

    if (!canUseRemoteMedia()) {
      failPlayback(
        source.codec || null,
        "broken",
        `${track?.title || "Track"}: ${PLAY_BLOCK_MESSAGES.broken}`
      );
      syncTransportFlags();
      return;
    }
    const remote = streamUrl(track, activeCodec);
    if (remote) {
      setPlaySourceState("streaming", activeCodec || null, null);
      result = await attemptPlay(remote, gen);
      if (!still(gen)) return;
      if (!result.ok) {
        console.error("Playback failed", result.err);
        failPlayback(
          activeCodec,
          "play_failed",
          PLAY_BLOCK_MESSAGES.play_failed
        );
      }
    } else {
      failPlayback(activeCodec, "play_failed", PLAY_BLOCK_MESSAGES.play_failed);
    }
  } else if (!result.ok) {
    console.error("Playback failed", result.err);
    failPlayback(
      player.playProfileId || activeCodec || null,
      "play_failed",
      PLAY_BLOCK_MESSAGES.play_failed
    );
  }
  if (still(gen) && result.ok) {
    emit(
      "player.load.ok",
      { play_source: player.playSource, profile: player.playProfileId },
      "info"
    );
  }
  syncTransportFlags();
}

export async function playIndex(index: number) {
  if (index < 0 || index >= pl.length) return;
  const gen = beginLoad();
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

  if (isExclusiveEnabled()) {
    return playExclusive(gen, track);
  }
  return playHtml(gen, track);
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
  const dur = activeSink.duration;
  if (!Number.isFinite(dur) || dur <= 0) return;
  activeSink.seek(frac * dur);
  onSinkTime(activeSink.currentTime, dur);
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

  if (msSupported) {
    navigator.mediaSession.setActionHandler("play", () => {
      ensureAudible();
    });
    navigator.mediaSession.setActionHandler("pause", () => activeSink.pause());
    navigator.mediaSession.setActionHandler("previoustrack", playPrev);
    navigator.mediaSession.setActionHandler("nexttrack", playNext);
    navigator.mediaSession.setActionHandler("seekto", (details) => {
      if (
        details.seekTime != null &&
        Number.isFinite(activeSink.duration) &&
        activeSink.duration > 0
      ) {
        activeSink.seek(details.seekTime);
        onSinkTime(activeSink.currentTime, activeSink.duration);
      }
    });
  }
}
