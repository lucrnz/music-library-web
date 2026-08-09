/**
 * Shared row/card factories for library browse.
 */
import { dirList, audio, icon } from "../dom.js";
import { coverUrl } from "../api.js";
import { pl } from "../state.js";
import { playIndex } from "../player.js";
import { addToQueue } from "../playlist.js";
import * as nav from "./nav.js";
import { renderLibrary } from "./context.js";

export function formatTrackLabel({ track, title, album, artist }) {
  const body = `${title || ""} - ${album || ""} [${artist || ""}]`;
  if (track == null || !Number.isFinite(Number(track))) return body;
  const n = Math.trunc(Number(track));
  if (n < 0) return body;
  return `${String(n).padStart(2, "0")}. ${body}`;
}

export function createAlbumCard(album) {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "album-card";
  const year = album.year ? String(album.year) : "";
  btn.innerHTML = `
    <img class="album-card-cover" src="${coverUrl({ albumId: album.id }, "thumb", false)}" alt="" loading="lazy" />
    <span class="album-card-title"></span>
    <span class="album-card-sub"></span>
  `;
  btn.querySelector(".album-card-title").textContent = album.title;
  btn.querySelector(".album-card-sub").textContent = [album.artist, year]
    .filter(Boolean)
    .join(" · ");
  btn.addEventListener("click", () => {
    nav.push({ kind: "album", id: album.id, name: album.title });
    renderLibrary();
  });
  return btn;
}

export function createAlbumRow(album) {
  const row = document.createElement("div");
  row.className = "row";
  const year = album.year ? ` · ${album.year}` : "";
  row.innerHTML = `
    <span class="row-cover-wrap">
      <img class="row-cover" src="${coverUrl({ albumId: album.id }, "thumb", false)}" alt="" loading="lazy" />
    </span>
    <span class="row-meta">
      <span class="row-title"></span>
      <span class="row-sub"></span>
    </span>
    <span class="row-chevron">${icon("chevron-right")}</span>
  `;
  row.querySelector(".row-title").textContent = album.title;
  row.querySelector(".row-sub").textContent =
    `${album.artist || ""}${year} · ${album.track_count} tracks`;
  row.addEventListener("click", () => {
    nav.push({ kind: "album", id: album.id, name: album.title });
    renderLibrary();
  });
  return row;
}

export function createTrackRow(track, { labelWithTrackNo = false } = {}) {
  const row = document.createElement("div");
  row.className = "row";
  row.innerHTML = `
    <span class="row-cover-wrap">
      <img class="row-cover" src="${coverUrl(track, "thumb", false)}" alt="" loading="lazy" />
    </span>
    <span class="row-meta">
      <span class="row-title"></span>
      <span class="row-sub"></span>
    </span>
    <button type="button" class="icon-btn row-add" title="Add to playlist" aria-label="Add to playlist">${icon("plus")}</button>
  `;
  row.querySelector(".row-title").textContent = labelWithTrackNo
    ? formatTrackLabel(track)
    : track.title;
  row.querySelector(".row-sub").textContent = labelWithTrackNo
    ? track.artist || ""
    : [track.artist, track.album].filter(Boolean).join(" — ");
  row.addEventListener("click", async (e) => {
    if (e.target.closest(".row-add")) return;
    const startPlay = pl.length === 0 || audio.paused;
    await addToQueue([track]);
    if (startPlay) playIndex(pl.length - 1);
  });
  row.querySelector(".row-add").addEventListener("click", async (e) => {
    e.stopPropagation();
    await addToQueue([track]);
  });
  return row;
}

export function renderAlbumGrid(albums) {
  dirList.classList.add("album-grid-host");
  dirList.innerHTML = "";
  const grid = document.createElement("div");
  grid.className = "album-grid";
  for (const album of albums) {
    grid.appendChild(createAlbumCard(album));
  }
  dirList.appendChild(grid);
}
