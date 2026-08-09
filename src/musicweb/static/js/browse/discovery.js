/**
 * Artists → Albums → Tracks discovery views.
 */
import { dirList, icon, showEmpty } from "../dom.js";
import { apiGet } from "../api.js";
import * as nav from "./nav.js";
import { isCurrent, renderLibrary } from "./context.js";
import { createTrackRow, renderAlbumGrid } from "./rows.js";

export async function renderArtistList(seq) {
  dirList.innerHTML = "";
  let data;
  try {
    data = await apiGet("/api/artists?limit=500");
  } catch (err) {
    if (!isCurrent(seq)) return;
    showEmpty(dirList, `Error: ${err.message}`);
    return;
  }
  if (!isCurrent(seq)) return;
  if (!data.items?.length) {
    showEmpty(
      dirList,
      "No artists yet — wait for library scan or re-scan in Settings"
    );
    return;
  }
  for (const artist of data.items) {
    const row = document.createElement("div");
    row.className = "row";
    row.innerHTML = `
      <span class="row-icon">${icon("library")}</span>
      <span class="row-meta">
        <span class="row-title"></span>
        <span class="row-sub"></span>
      </span>
      <span class="row-chevron">${icon("chevron-right")}</span>
    `;
    row.querySelector(".row-title").textContent = artist.name;
    row.querySelector(".row-sub").textContent =
      `${artist.album_count} album${artist.album_count === 1 ? "" : "s"} · ${artist.track_count} tracks`;
    row.addEventListener("click", () => {
      nav.push({ kind: "artist", id: artist.id, name: artist.name });
      renderLibrary();
    });
    dirList.appendChild(row);
  }
}

export async function renderAlbumList(seq) {
  dirList.innerHTML = "";
  let data;
  try {
    data = await apiGet("/api/albums?limit=500&sort=title");
  } catch (err) {
    if (!isCurrent(seq)) return;
    showEmpty(dirList, `Error: ${err.message}`);
    return;
  }
  if (!isCurrent(seq)) return;
  if (!data.items?.length) {
    showEmpty(
      dirList,
      "No albums yet — wait for library scan or re-scan in Settings"
    );
    return;
  }
  renderAlbumGrid(data.items);
}

export async function renderArtistAlbums(seq, artistId) {
  dirList.innerHTML = "";
  let data;
  try {
    data = await apiGet(`/api/artists/${encodeURIComponent(artistId)}/albums`);
  } catch (err) {
    if (!isCurrent(seq)) return;
    showEmpty(dirList, `Error: ${err.message}`);
    return;
  }
  if (!isCurrent(seq)) return;
  if (!data.items?.length) {
    showEmpty(dirList, "No albums for this artist");
    return;
  }
  renderAlbumGrid(data.items);
}

export async function renderAlbumTracks(seq, albumId) {
  dirList.innerHTML = "";
  let data;
  try {
    data = await apiGet(`/api/albums/${encodeURIComponent(albumId)}/tracks`);
  } catch (err) {
    if (!isCurrent(seq)) return;
    showEmpty(dirList, `Error: ${err.message}`);
    return;
  }
  if (!isCurrent(seq)) return;
  if (!data.items?.length) {
    showEmpty(dirList, "No tracks");
    return;
  }
  for (const track of data.items) {
    dirList.appendChild(createTrackRow(track, { labelWithTrackNo: true }));
  }
}
