/**
 * Playback control + Media Session. Uses a shared HTMLAudioElement.
 */
import { reactive } from "vue";
import { coverUrl, streamUrl } from "../api.js";
import { resolveCoverUrl, resolvePlaySource } from "../downloads/resolve.js";
import {
  downloads,
  isHardOffline,
  markDownloadBroken,
} from "./downloads.js";
import { pl, commit } from "./playlist.js";
import { settings } from "./settings.js";

const VOLUME_STORAGE_KEY = "musicweb.volume";

/** Shared audio element (attached to document.body at boot). */
export const audio = new Audio();
audio.preload = "metadata";
audio.setAttribute("playsinline", "");

/** @type {string | null} blob: URL we must revoke */
let localPlayUrl = null;

export const player = reactive({
  seeking: false,
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

async function updateMediaSession() {
  if (!msSupported) return;
  const t = pl.current;
  if (!t) {
    navigator.mediaSession.metadata = null;
    return;
  }
  const albumId = t.album_id || t.albumId;
  const thumb = await resolveCoverUrl(
    albumId,
    "thumb",
    coverUrl(t, "thumb", false),
    downloads.enabled
  );
  const full = await resolveCoverUrl(
    albumId,
    "full",
    coverUrl(t, "full", false),
    downloads.enabled
  );
  navigator.mediaSession.metadata = new MediaMetadata({
    title: t.title,
    artist: t.artist,
    album: t.album,
    artwork: [
      { src: thumb, sizes: "200x200", type: "image/webp" },
      { src: full, sizes: "1000x1000", type: "image/webp" },
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
  updateMediaSession();
}

export function stopPlayback() {
  audio.pause();
  audio.removeAttribute("src");
  audio.load();
  revokeLocalPlayUrl();
  player.fromDownload = false;
  setPlayNotice(null);
  pl.index = -1;
  player.currentTime = 0;
  player.duration = 0;
  commit();
  syncTransportFlags();
}

export async function playIndex(index) {
  if (index < 0 || index >= pl.length) return;
  pl.index = index;
  if (pl.shuffle) {
    pl.shufflePos = pl.shuffleOrder.indexOf(index);
  }
  const track = pl.current;
  commit();
  updateMediaSession();

  revokeLocalPlayUrl();
  player.fromDownload = false;
  setPlayNotice(null);

  const source = await resolvePlaySource(track, {
    enabled: downloads.enabled,
    codec: settings.stream,
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
      const remote = streamUrl(track, settings.stream);
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
  player.currentTime = audio.currentTime;
  updatePositionState();
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
    player.currentTime = audio.currentTime || 0;
    if (Number.isFinite(audio.duration)) player.duration = audio.duration;
    updatePositionState();
  });
  audio.addEventListener("loadedmetadata", () => {
    if (Number.isFinite(audio.duration)) player.duration = audio.duration;
    updatePositionState();
    const t = pl.current;
    if (t && !t.duration) {
      t.duration = audio.duration;
      commit();
    }
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
      }
    });
  }
}
