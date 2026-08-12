/**
 * Playback control + Media Session. Uses a shared HTMLAudioElement.
 */
import { reactive } from "vue";
import { coverUrl, requestPrepare, streamUrl } from "../api.js";
import { canReachServer, isHardOffline } from "../connectivity.js";
import { markDownloadBroken } from "../downloads/index.js";
import { resolveCoverUrl, resolvePlaySource } from "../downloads/resolve.js";
import { downloads } from "../downloads/state.js";
import { PLACEHOLDER_COVER } from "../util.js";
import { pl, commit, trackNeedsStreamPrepare } from "./playlist.js";
import { getActiveStreamCodec, settings } from "./settings.js";

const VOLUME_STORAGE_KEY = "musicweb.volume";
const EXPANDED_STORAGE_KEY = "musicweb.nowPlayingExpanded.v1";
/** Seconds before end to urgent-prepare the next queue track (once per load). */
const PREPARE_LEAD_SECONDS = 15;

/** Shared audio element (attached to document.body at boot). */
export const audio = new Audio();
audio.preload = "metadata";
audio.setAttribute("playsinline", "");

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
  fromDownload: false,
  /** User-visible play block message (null when clear) */
  playNotice: null,
  /** Resolved cover URLs for PlayerBar (local OPFS or remote / placeholder). */
  coverThumb: PLACEHOLDER_COVER,
  coverFull: PLACEHOLDER_COVER,
  /** Expanded now-playing: lyrics overlay open */
  lyricsOpen: false,
});

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
 * Resolve local/remote covers into player state + Media Session.
 *
 * Never paints remote /api/cover URLs until OPFS has been checked — otherwise
 * <img> tags kick off network fetches for already-downloaded album art.
 * Same-track calls (play/pause) are no-ops so we do not re-hit the network.
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
  // Drop previous track art while we resolve — never assign remote yet.
  clearCovers();

  // Playlist holds full Track only — albumId comes from the producer.
  const albumId = t.albumId || null;
  if (gen !== coverResolveGen) return;

  // Remote only when we can actually reach the library server.
  const allowRemote = !isHardOffline() && canReachServer();
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
  const dur = audio.duration;
  if (!Number.isFinite(dur) || dur <= 0) return;
  try {
    navigator.mediaSession.setPositionState({
      duration: dur,
      playbackRate: audio.playbackRate || 1,
      position: Math.min(audio.currentTime, dur),
    });
  } catch {
    /* ignore */
  }
}

function syncTransportFlags() {
  player.paused = audio.paused;
  player.currentTime = audio.currentTime || 0;
  player.duration = Number.isFinite(audio.duration) ? audio.duration : 0;
  if (msSupported) {
    navigator.mediaSession.playbackState =
      pl.index >= 0 ? (audio.paused ? "paused" : "playing") : "none";
  }
}

export function stopPlayback() {
  audio.pause();
  audio.removeAttribute("src");
  audio.load();
  revokeLocalPlayUrl();
  player.fromDownload = false;
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

/**
 * Sync reactive position from the shared audio element, then maybe
 * urgent-prepare the next queue track (once per playIndex load).
 */
function onAudioPositionChanged() {
  player.currentTime = audio.currentTime || 0;
  if (Number.isFinite(audio.duration)) player.duration = audio.duration;
  updatePositionState();
  maybePrepareNext();
}

/**
 * If playback is within PREPARE_LEAD_SECONDS of the end, urgent-prepare the
 * next queue track at most once for this playIndex session.
 */
function maybePrepareNext() {
  if (nearEndPrepareSent) return;
  const dur = audio.duration;
  if (!Number.isFinite(dur) || dur <= 0) return;
  const remaining = dur - (audio.currentTime || 0);
  if (remaining > PREPARE_LEAD_SECONDS) return;

  const nextIdx = pl.peekNextIndex();
  if (nextIdx < 0 || nextIdx === pl.index) {
    // No distinct next track (end of queue / repeat one / unknown shuffle wrap).
    nearEndPrepareSent = true;
    return;
  }
  const nextTrack = pl.tracks[nextIdx];
  if (!nextTrack?.id) {
    nearEndPrepareSent = true;
    return;
  }
  // Transient: do not latch — reconnect while still in the window can prepare.
  if (isHardOffline() || !canReachServer()) return;

  // Latch before async work so concurrent timeupdate/seek cannot double-send.
  nearEndPrepareSent = true;
  void issueNearEndPrepare(nextTrack);
}

/**
 * @param {import("../models/track.js").Track} nextTrack
 */
async function issueNearEndPrepare(nextTrack) {
  const activeCodec = getActiveStreamCodec();
  if (!(await trackNeedsStreamPrepare(nextTrack, activeCodec))) return;
  requestPrepare([nextTrack], activeCodec, { urgent: true });
}

export async function playIndex(index) {
  if (index < 0 || index >= pl.length) return;
  pl.index = index;
  if (pl.shuffle) {
    pl.shufflePos = pl.shuffleOrder.indexOf(index);
  }
  const track = pl.current;
  commit();
  nearEndPrepareSent = false;
  // Resolve covers for the new track (local-first; no remote paint until checked).
  lastCoverTrackId = null;
  updateMediaSession();

  revokeLocalPlayUrl();
  player.fromDownload = false;
  setPlayNotice(null);

  const activeCodec = getActiveStreamCodec();
  const source = await resolvePlaySource(track, {
    enabled: downloads.enabled,
    activeStreamCodec: activeCodec,
    playbackPolicy: settings.playbackPolicy,
    catalog: settings.options,
    offline: isHardOffline(),
  });

  if (source.type === "unavailable") {
    const title = track?.title || "Track";
    setPlayNotice(source.message ? `${title}: ${source.message}` : source.message);
    syncTransportFlags();
    return;
  }

  if (source.type === "local") {
    localPlayUrl = source.url;
    player.fromDownload = true;
  }

  audio.src = source.url;
  try {
    await audio.play();
  } catch (err) {
    if (player.fromDownload) {
      console.warn("Local playback failed, falling back to stream", err);
      if (track?.id) markDownloadBroken(track.id).catch(() => {});
      revokeLocalPlayUrl();
      player.fromDownload = false;

      if (isHardOffline()) {
        setPlayNotice(
          `${track?.title || "Track"}: Local file is unreadable. Re-download when online.`
        );
        syncTransportFlags();
        return;
      }
      const remote = streamUrl(track, getActiveStreamCodec());
      if (remote) {
        audio.src = remote;
        try {
          await audio.play();
        } catch (err2) {
          console.error("Playback failed", err2);
          setPlayNotice("Playback failed");
        }
      }
    } else {
      console.error("Playback failed", err);
      setPlayNotice("Playback failed");
    }
  }
  syncTransportFlags();
}

export function playNext() {
  const idx = pl.nextIndex();
  if (idx < 0) {
    audio.pause();
    syncTransportFlags();
    return;
  }
  playIndex(idx);
}

export function playPrev() {
  const result = pl.prevIndex(audio.currentTime);
  if (result && typeof result === "object" && result.restart) {
    audio.currentTime = 0;
    return;
  }
  if (typeof result === "number" && result >= 0) playIndex(result);
}

export function togglePlay() {
  if (!pl.length) return;
  if (pl.index < 0) {
    playIndex(0);
    return;
  }
  if (audio.paused) audio.play().catch(console.error);
  else audio.pause();
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
  const dur = audio.duration;
  if (!Number.isFinite(dur)) return;
  audio.currentTime = frac * dur;
  onAudioPositionChanged();
}

export function setVolume(v) {
  const n = Math.min(1, Math.max(0, Number(v)));
  player.volume = n;
  audio.volume = n;
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
  audio.volume = player.volume;
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
  if (!audio.isConnected) {
    audio.hidden = true;
    document.body.appendChild(audio);
  }
  audio.addEventListener("play", syncTransportFlags);
  audio.addEventListener("pause", syncTransportFlags);
  audio.addEventListener("ended", () => {
    if (pl.repeat === "one") {
      audio.currentTime = 0;
      audio.play().catch(console.error);
      return;
    }
    playNext();
  });
  audio.addEventListener("timeupdate", () => {
    if (player.seeking) return;
    onAudioPositionChanged();
  });
  audio.addEventListener("loadedmetadata", () => {
    const t = pl.current;
    if (t && Number.isFinite(audio.duration) && !t.duration) {
      t.duration = audio.duration;
      commit();
    }
    onAudioPositionChanged();
  });

  if (msSupported) {
    navigator.mediaSession.setActionHandler("play", () => {
      if (pl.index < 0 && pl.length) playIndex(0);
      else audio.play().catch(console.error);
    });
    navigator.mediaSession.setActionHandler("pause", () => audio.pause());
    navigator.mediaSession.setActionHandler("previoustrack", playPrev);
    navigator.mediaSession.setActionHandler("nexttrack", playNext);
    navigator.mediaSession.setActionHandler("seekto", (details) => {
      if (details.seekTime != null && Number.isFinite(audio.duration)) {
        audio.currentTime = details.seekTime;
        onAudioPositionChanged();
      }
    });
  }
}
