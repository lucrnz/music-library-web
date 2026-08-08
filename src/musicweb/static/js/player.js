/**
 * Playback: the audio element, transport controls, seek/volume, and
 * Media Session (OS lock-screen / control-center) integration.
 */
import {
  $,
  audio,
  player,
  coverArt,
  coverArtFull,
  npTitle,
  npArtist,
  npTitleFull,
  npArtistFull,
  timeCur,
  timeTotal,
  seek,
  volume,
  btnPlay,
  btnPlayMini,
  btnShuffle,
  btnRepeat,
  setIcon,
  formatTime,
} from "./dom.js";
import { pl, codec, commit, render } from "./state.js";
import { coverUrl } from "./api.js";

/** Placeholder cover — the initial <img> src in index.html is the single source. */
const PLACEHOLDER_COVER = coverArt.src;

/** Now-playing fields come in mini/full pairs; updateNowPlaying loops over them. */
const npPairs = [
  { title: npTitle, artist: npArtist, cover: coverArt, coverSize: "thumb" },
  { title: npTitleFull, artist: npArtistFull, cover: coverArtFull, coverSize: "full" },
];

let seeking = false;

// ── Media Session ────────────────────────────────────────────────────
const msSupported = "mediaSession" in navigator;

/** Publish current track metadata (title/artist/album/artwork) to the OS. */
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
      // Stable (non-cache-busted) URLs so the OS can cache artwork
      { src: coverUrl(t.path, "thumb", false), sizes: "200x200", type: "image/webp" },
      { src: coverUrl(t.path, "full", false), sizes: "1000x1000", type: "image/webp" },
    ],
  });
}

/** Report position/duration so the OS shows an accurate seek bar. */
function updatePositionState() {
  if (!msSupported || typeof navigator.mediaSession.setPositionState !== "function") {
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

// ── Transport / now-playing UI ─────────────────────────────────────────
export function updateTransportUI() {
  const playing = !audio.paused;
  for (const btn of [btnPlay, btnPlayMini]) {
    setIcon(btn, playing ? "pause" : "play");
  }
  btnShuffle.setAttribute("aria-pressed", pl.shuffle ? "true" : "false");
  btnRepeat.setAttribute("aria-pressed", pl.repeat !== "off" ? "true" : "false");
  setIcon(btnRepeat, pl.repeat === "one" ? "repeat-one" : "repeat");
  if (msSupported) {
    navigator.mediaSession.playbackState =
      pl.index >= 0 ? (playing ? "playing" : "paused") : "none";
  }
  // Re-render so the playing row's equalizer reflects the paused state.
  render.playlist();
}

export function updateNowPlaying() {
  const t = pl.current;
  player.classList.toggle("hidden", !t && pl.length === 0);
  const title = t ? t.title : "—";
  const sub = t
    ? [t.artist, t.album].filter(Boolean).join(" — ") || "Unknown"
    : "No track";
  for (const p of npPairs) {
    p.title.textContent = title;
    p.artist.textContent = sub;
    // Mini player: small server-side thumbnail; sheet: full extracted art
    p.cover.src = t ? coverUrl(t.path, p.coverSize) : PLACEHOLDER_COVER;
  }
  updateMediaSession();
}

// ── Playback control ───────────────────────────────────────────────────
export function stopPlayback() {
  audio.pause();
  audio.removeAttribute("src");
  audio.load();
  pl.index = -1;
  seek.value = "0";
  timeCur.textContent = "0:00";
  timeTotal.textContent = "0:00";
  commit();
}

export async function playIndex(index) {
  if (index < 0 || index >= pl.length) return;
  pl.index = index;
  if (pl.shuffle) {
    pl.shufflePos = pl.shuffleOrder.indexOf(index);
  }
  const track = pl.current;
  commit();

  const url = `/api/stream?path=${encodeURIComponent(track.path)}&codec=${encodeURIComponent(codec.stream)}`;
  audio.src = url;
  try {
    await audio.play();
  } catch (err) {
    // Benign cases (e.g. transcode still warming up, autoplay policy)
    // surface here; the audio element retries/recovers on its own.
    console.error("Playback failed", err);
  }
  updateTransportUI();
}

function playNext() {
  const idx = pl.nextIndex();
  if (idx < 0) {
    audio.pause();
    updateTransportUI();
    return;
  }
  playIndex(idx);
}

function playPrev() {
  const idx = pl.prevIndex();
  if (idx >= 0) playIndex(idx);
}

function togglePlay() {
  if (!pl.length) return;
  if (pl.index < 0) {
    playIndex(0);
    return;
  }
  if (audio.paused) audio.play().catch(console.error);
  else audio.pause();
  updateTransportUI();
}

// ── Audio events ───────────────────────────────────────────────────────
audio.addEventListener("play", updateTransportUI);
audio.addEventListener("pause", updateTransportUI);
audio.addEventListener("ended", () => {
  if (pl.repeat === "one") {
    audio.currentTime = 0;
    audio.play().catch(console.error);
    return;
  }
  playNext();
});
audio.addEventListener("timeupdate", () => {
  if (seeking) return;
  const dur = audio.duration;
  const cur = audio.currentTime;
  timeCur.textContent = formatTime(cur);
  if (Number.isFinite(dur)) {
    timeTotal.textContent = formatTime(dur);
    seek.value = String(Math.round((cur / dur) * 1000));
  }
  updatePositionState();
});
audio.addEventListener("loadedmetadata", () => {
  timeTotal.textContent = formatTime(audio.duration);
  updatePositionState();
  const t = pl.current;
  if (t && !t.duration) {
    t.duration = audio.duration;
    commit();
  }
});

seek.addEventListener("pointerdown", () => {
  seeking = true;
});
seek.addEventListener("pointerup", () => {
  seeking = false;
  const dur = audio.duration;
  if (Number.isFinite(dur)) {
    audio.currentTime = (Number(seek.value) / 1000) * dur;
  }
});
seek.addEventListener("input", () => {
  const dur = audio.duration;
  if (Number.isFinite(dur)) {
    timeCur.textContent = formatTime((Number(seek.value) / 1000) * dur);
  }
});

volume.addEventListener("input", () => {
  audio.volume = Number(volume.value);
});

// ── Transport buttons ──────────────────────────────────────────────────
for (const btn of [btnPlay, btnPlayMini]) {
  btn.addEventListener("click", togglePlay);
}
for (const btn of [$("btn-next"), $("btn-next-mini")]) {
  btn.addEventListener("click", playNext);
}
$("btn-prev").addEventListener("click", playPrev);

btnShuffle.addEventListener("click", () => {
  pl.shuffle = !pl.shuffle;
  if (pl.shuffle) pl.rebuildShuffle();
  commit();
});

btnRepeat.addEventListener("click", () => {
  if (pl.repeat === "off") pl.repeat = "all";
  else if (pl.repeat === "all") pl.repeat = "one";
  else pl.repeat = "off";
  commit();
});
