/**
 * Playback control + Media Session. Uses a shared HTMLAudioElement.
 */
import { reactive } from "vue";
import { coverUrl, streamUrl } from "../api.js";
import { pl, commit } from "./playlist.js";
import { settings } from "./settings.js";

const VOLUME_STORAGE_KEY = "musicweb.volume";

/** Shared audio element (attached to document.body at boot). */
export const audio = new Audio();
audio.preload = "metadata";
audio.setAttribute("playsinline", "");

export const player = reactive({
  seeking: false,
  expanded: false,
  /** drag transform for mobile sheet */
  sheetOffset: 0,
  draggingSheet: false,
  volume: 1,
  /** seconds; updated from audio events */
  currentTime: 0,
  duration: 0,
  paused: true,
});

const msSupported = "mediaSession" in navigator;

function updateMediaSession() {
  if (!msSupported) return;
  const t = pl.current;
  if (!t) {
    navigator.mediaSession.metadata = null;
    return;
  }
  navigator.mediaSession.metadata = new MediaMetadata({
    title: t.title,
    artist: t.artist,
    album: t.album,
    artwork: [
      { src: coverUrl(t, "thumb", false), sizes: "200x200", type: "image/webp" },
      { src: coverUrl(t, "full", false), sizes: "1000x1000", type: "image/webp" },
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
    /* ignore out-of-range positions */
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

  const url = streamUrl(track, settings.stream);
  if (!url) return;
  audio.src = url;
  try {
    await audio.play();
  } catch (err) {
    console.error("Playback failed", err);
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

/** Wire audio element listeners once at boot. */
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
