/**
 * DOM element refs + tiny shared helpers. Leaf module: refs are resolved
 * once at load from index.html.
 */

export const $ = (id) => document.getElementById(id);
export const dirList = $("dir-list");
export const plList = $("pl-list");
export const audio = $("audio");
export const player = $("player");
export const coverArt = $("cover-art");
export const coverArtFull = $("cover-art-full");
export const npTitle = $("np-title");
export const npArtist = $("np-artist");
export const npTitleFull = $("np-title-full");
export const npArtistFull = $("np-artist-full");
export const timeCur = $("time-cur");
export const timeTotal = $("time-total");
export const seek = $("seek");
export const volume = $("volume");
export const settingsModal = $("settings-modal");
export const codecList = $("codec-list");
export const btnPlay = $("btn-play");
export const btnPlayMini = $("btn-play-mini");
export const btnShuffle = $("btn-shuffle");
export const btnRepeat = $("btn-repeat");
export const btnBack = $("btn-back");
export const btnAddAll = $("btn-add-all");
export const btnAddSelected = $("btn-add-selected");
export const btnEdit = $("btn-edit");
export const btnClear = $("btn-clear");
export const libraryTitle = $("library-title");
export const viewLibrary = $("view-library");
export const viewPlaylist = $("view-playlist");
export const tabLibrary = $("tab-library");
export const tabPlaylist = $("tab-playlist");

export function formatTime(sec) {
  if (sec == null || !Number.isFinite(sec) || sec < 0) return "0:00";
  const s = Math.floor(sec % 60);
  const m = Math.floor(sec / 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function icon(name) {
  return `<svg class="icon" aria-hidden="true"><use href="#i-${name}"></use></svg>`;
}

export function setIcon(btn, name) {
  btn.querySelector("use").setAttribute("href", `#i-${name}`);
}

export function showEmpty(listEl, msg) {
  const el = document.createElement("div");
  el.className = "list-empty";
  el.textContent = msg;
  listEl.appendChild(el);
}
