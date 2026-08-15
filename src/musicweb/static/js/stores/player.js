/**
 * Playback control + Media Session. Transport goes through the active sink
 * (htmlAudio or exclusive companion) — HTMLAudioElement is not exported.
 */
import { reactive } from "vue";
import { coverUrl, requestPrepare, streamUrl } from "../api.js";
import { canReachServer, getConnectivityState } from "../connectivity.js";
import { beginPlay, emit } from "../diag/log.js";
import { markDownloadBroken } from "../downloads/index.js";
import { resolveCoverUrl, resolvePlaySource } from "../downloads/resolve.js";
import { downloads } from "../downloads/state.js";
import { createCompanionSink } from "../playback/sinks/companionSink.js";
import { createHtmlAudioSink } from "../playback/sinks/htmlAudioSink.js";
import { ensurePreferredDevice } from "../exclusive/companionClient.js";
import { supportsCodecKind } from "../codecSupport.js";
import { deliveryCodec } from "../lossyKind.js";
import { PLAY_BLOCK_MESSAGES } from "../playBlock.js";
import { showToast } from "./ui.js";
import { PLACEHOLDER_COVER } from "../util.js";
import {
  consumeMissingTechToast,
  getExclusiveProfileTag,
  isExclusiveEnabled,
} from "./exclusiveAudio.js";
import { pl, commit, trackNeedsStreamPrepare } from "./playlist.js";
import { getActiveStreamCodec, openSettings, settings } from "./settings.js";

const VOLUME_STORAGE_KEY = "musicweb.volume";
const EXPANDED_STORAGE_KEY = "musicweb.nowPlayingExpanded.v1";
/** Seconds before end to urgent-prepare the next queue track (once per load). */
const PREPARE_LEAD_SECONDS = 15;

const htmlSink = createHtmlAudioSink();
const companionSink = createCompanionSink();

/** @type {import('../playback/sinks/types.js').PlaybackSink} */
let activeSink = htmlSink;

/** @type {string | null} blob: URL we must revoke */
let localPlayUrl = null;

/** Bumps when current track / cover resolve context changes (stale-await guard). */
let coverResolveGen = 0;

/** Track id we last resolved covers for (skip redundant resolve on play/pause). */
let lastCoverTrackId = null;

/**
 * Near-end prepare already fired (or permanently no next) for this playIndex
 * load. Not reset on seek/scrub. Offline does not latch — reconnect can still
 * prepare once while still in the lead window.
 */
let nearEndPrepareSent = false;

/** Current playIndex / stopPlayback load generation (stale-await guard). */
let playGen = 0;

/**
 * @typedef {import('../playBlock.js').PlaySourceState} PlaySourceState
 * @typedef {import('../playBlock.js').PlayBlockReason} PlayBlockReason
 */

export const player = reactive({
  seeking: false,
  /** Full now-playing open (mobile sheet / desktop right panel) */
  expanded: false,
  sheetOffset: 0,
  draggingSheet: false,
  volume: 1,
  currentTime: 0,
  duration: 0,
  paused: true,
  /**
   * Delivery source for the current load (not library path).
   * @type {PlaySourceState}
   */
  playSource: "none",
  /** Delivery profile tag actually used or intended (null when none). */
  playProfileId: null,
  /**
   * Machine reason when playSource is unavailable.
   * @type {PlayBlockReason | null}
   */
  playBlockReason: null,
  /** User-visible play block message (null when clear) */
  playNotice: null,
  /** Resolved cover URLs for PlayerBar (local OPFS or remote / placeholder). */
  coverThumb: PLACEHOLDER_COVER,
  coverFull: PLACEHOLDER_COVER,
  /** Expanded now-playing: lyrics overlay open */
  lyricsOpen: false,
});

/**
 * Atomic writer for the play-source triple (never leave a field stale).
 * @param {PlaySourceState} playSource
 * @param {string | null} playProfileId
 * @param {PlayBlockReason | null} playBlockReason
 */
function setPlaySourceState(playSource, playProfileId, playBlockReason) {
  player.playSource = playSource;
  player.playProfileId = playProfileId || null;
  player.playBlockReason = playBlockReason || null;
}

function clearPlaySourceState() {
  setPlaySourceState("none", null, null);
}

function failCtx(extra) {
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

/**
 * @param {number} gen
 */
function still(gen) {
  return gen === playGen;
}

function invalidateLoads() {
  playGen += 1;
}

/**
 * Apply resolvePlaySource result onto player face state (same vocabulary).
 * @param {import('../downloads/resolve.js').PlaySource | { type: string, codec?: string|null, reason?: string|null }} source
 * @param {string | null | undefined} activeCodec
 */
function applyResolvedSource(source, activeCodec) {
  if (source.type === "unavailable") {
    setPlaySourceState(
      "unavailable",
      source.codec || activeCodec || null,
      /** @type {PlayBlockReason} */ (source.reason || "missing")
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
 * @param {string | null | undefined} profileId
 * @param {PlayBlockReason} reason
 * @param {string | null | undefined} notice
 */
function failPlayback(profileId, reason, notice) {
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

function setPlayNotice(msg) {
  player.playNotice = msg || null;
}

function clearCovers() {
  player.coverThumb = PLACEHOLDER_COVER;
  player.coverFull = PLACEHOLDER_COVER;
}

/**
 * @param {'htmlAudio' | 'companion'} kind
 */
function selectSink(kind) {
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

/**
 * Resolve local/remote covers into player state + Media Session.
 */
async function updateMediaSession() {
  const t = pl.current;
  if (!t) {
    coverResolveGen += 1;
    lastCoverTrackId = null;
    clearCovers();
    if (msSupported) navigator.mediaSession.metadata = null;
    return;
  }

  const trackKey = t.id || t.path || null;
  if (trackKey != null && trackKey === lastCoverTrackId) {
    return;
  }

  const gen = ++coverResolveGen;
  clearCovers();

  const albumId = t.albumId || null;
  if (gen !== coverResolveGen) return;

  const allowRemote = canReachServer();
  const opts = { offline: !allowRemote };
  const remoteThumb = allowRemote ? coverUrl(t, "thumb", false) : null;
  const remoteFull = allowRemote ? coverUrl(t, "full", false) : null;

  const [thumb, full] = await Promise.all([
    resolveCoverUrl(albumId, "thumb", remoteThumb, downloads.enabled, opts),
    resolveCoverUrl(albumId, "full", remoteFull, downloads.enabled, opts),
  ]);

  if (gen !== coverResolveGen) return;
  if (pl.current?.id !== t.id) return;

  lastCoverTrackId = trackKey;
  player.coverThumb = thumb || PLACEHOLDER_COVER;
  player.coverFull = full || PLACEHOLDER_COVER;

  if (!msSupported) return;
  navigator.mediaSession.metadata = new MediaMetadata({
    title: t.title,
    artist: t.artist,
    album: t.album,
    artwork: [
      { src: player.coverThumb, sizes: "200x200", type: "image/webp" },
      { src: player.coverFull, sizes: "1000x1000", type: "image/webp" },
    ],
  });
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
 * @param {string | null | undefined} message
 * @param {import('../playBlock.js').PlayBlockReason} [reason]
 * @param {{ openSettings?: boolean }} [opts]
 */
function hardStopCompanion(message, reason = "exclusive_failed", opts = {}) {
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

function onSinkTime(t, d) {
  if (player.seeking) return;
  player.currentTime = t || 0;
  if (Number.isFinite(d) && d > 0) player.duration = d;
  updatePositionState();
  maybePrepareNext();
}

function wireSinkHandlers() {
  const handlers = {
    onTime: onSinkTime,
    onDuration: (d) => {
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
    onError: (message, code, details) => {
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
  lastCoverTrackId = null;
  nearEndPrepareSent = false;
  clearCovers();
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

/**
 * @param {import("../models/track.js").Track} nextTrack
 */
async function issueNearEndPrepare(nextTrack) {
  if (nextTrack?.isLossy) return;
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

/**
 * @param {string} url
 * @param {number} gen
 * @returns {Promise<{ ok: true } | { ok: false, err: unknown }>}
 */
async function attemptPlay(url, gen) {
  if (!still(gen)) return { ok: false, err: undefined };
  try {
    await activeSink.load(url);
    return { ok: true };
  } catch (err) {
    if (activeSink.kind === "htmlAudio") {
      emit(
        "sink.html.play_reject",
        failCtx({
          name: err && err.name ? err.name : null,
          message: err && err.message ? err.message : String(err ?? ""),
        }),
        "error"
      );
    }
    return { ok: false, err };
  }
}

/**
 * Absolute stream URL for companion (must hit the browser's origin host).
 * @param {import("../models/track.js").Track} track
 * @param {string} tag
 */
function absoluteStreamUrl(track, tag) {
  const path = streamUrl(track, tag);
  if (!path) return null;
  try {
    return new URL(path, location.origin).href;
  } catch {
    return null;
  }
}

/**
 * @param {number} gen
 * @param {import("../models/track.js").Track} track
 */
async function playExclusive(gen, track) {
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

/**
 * @param {number} gen
 * @param {import("../models/track.js").Track} track
 */
async function playHtml(gen, track) {
  selectSink("htmlAudio");
  if (track?.isLossy) {
    const kind = (track.sourceCodec || "").toLowerCase();
    const ok = kind ? await supportsCodecKind(kind) : false;
    if (!still(gen)) return;
    if (!ok) {
      failPlayback(
        "source",
        "codec_unsupported",
        PLAY_BLOCK_MESSAGES.codec_unsupported
      );
      syncTransportFlags();
      return;
    }
  }
  const activeCodec = deliveryCodec(track, getActiveStreamCodec());
  const source = await resolvePlaySource(track, {
    enabled: downloads.enabled,
    activeStreamCodec: activeCodec,
    playbackPolicy: settings.playbackPolicy,
    catalog: settings.options,
    offline: !canReachServer(),
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

    if (!canReachServer()) {
      failPlayback(
        source.codec || null,
        "broken",
        `${track?.title || "Track"}: ${PLAY_BLOCK_MESSAGES.broken}`
      );
      syncTransportFlags();
      return;
    }
    const streamCodec = deliveryCodec(track, getActiveStreamCodec());
    const remote = streamUrl(track, streamCodec);
    if (remote) {
      setPlaySourceState("streaming", streamCodec || null, null);
      result = await attemptPlay(remote, gen);
      if (!still(gen)) return;
      if (!result.ok) {
        console.error("Playback failed", result.err);
        const reason = track?.isLossy ? "codec_unsupported" : "play_failed";
        failPlayback(
          streamCodec,
          reason,
          PLAY_BLOCK_MESSAGES[reason]
        );
      }
    } else {
      failPlayback(streamCodec, "play_failed", PLAY_BLOCK_MESSAGES.play_failed);
    }
  } else if (!result.ok) {
    console.error("Playback failed", result.err);
    const reason = track?.isLossy ? "codec_unsupported" : "play_failed";
    failPlayback(
      player.playProfileId || activeCodec || null,
      reason,
      PLAY_BLOCK_MESSAGES[reason]
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

export async function playIndex(index) {
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
  lastCoverTrackId = null;
  updateMediaSession();
  revokeLocalPlayUrl();
  setPlayNotice(null);

  if (isExclusiveEnabled()) {
    return playExclusive(gen, track);
  }
  return playHtml(gen, track);
}

export function playNext() {
  const idx = pl.nextIndex();
  if (idx < 0) {
    try {
      activeSink.pause();
    } catch {
      /* ignore */
    }
    syncTransportFlags();
    return;
  }
  playIndex(idx);
}

export function playPrev() {
  const result = pl.prevIndex(activeSink.currentTime);
  if (result && typeof result === "object" && result.restart) {
    activeSink.seek(0);
    return;
  }
  if (typeof result === "number" && result >= 0) playIndex(result);
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

export function seekToFraction(frac) {
  const dur = activeSink.duration;
  if (!Number.isFinite(dur) || dur <= 0) return;
  activeSink.seek(frac * dur);
  onSinkTime(activeSink.currentTime, dur);
}

export function setVolume(v) {
  const n = Math.min(1, Math.max(0, Number(v)));
  player.volume = n;
  activeSink.setVolume(n);
  try {
    localStorage.setItem(VOLUME_STORAGE_KEY, String(n));
  } catch {
    /* ignore */
  }
}

export function applyVolume() {
  try {
    const raw = localStorage.getItem(VOLUME_STORAGE_KEY);
    if (raw != null) {
      const v = Number(raw);
      if (Number.isFinite(v) && v >= 0 && v <= 1) player.volume = v;
    }
  } catch {
    /* ignore */
  }
  activeSink.setVolume(player.volume);
}

/** Open/close full now-playing and persist the preference. */
export function setExpanded(open) {
  const next = !!open;
  player.expanded = next;
  if (!next) {
    player.sheetOffset = 0;
    player.draggingSheet = false;
    player.lyricsOpen = false;
  }
  try {
    localStorage.setItem(EXPANDED_STORAGE_KEY, next ? "1" : "0");
  } catch {
    /* ignore */
  }
}

/**
 * Restore now-playing expanded flag from localStorage.
 * Call after loadPlaylist(); stays collapsed when the queue is empty.
 */
export function applyExpanded() {
  let want = false;
  try {
    want = localStorage.getItem(EXPANDED_STORAGE_KEY) === "1";
  } catch {
    /* ignore */
  }
  if (want && pl.length > 0) {
    player.expanded = true;
  } else {
    player.expanded = false;
  }
}

/** Resolve covers for the current playlist track (e.g. after session restore). */
export function refreshPlayerCovers() {
  return updateMediaSession();
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
