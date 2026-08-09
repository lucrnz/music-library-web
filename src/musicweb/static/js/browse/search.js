/**
 * Full-text search results view.
 */
import { dirList, icon, showEmpty } from "../dom.js";
import { apiGet, artistImageUrl } from "../api.js";
import * as nav from "./nav.js";
import { isCurrent, renderLibrary } from "./context.js";
import { createAlbumRow, createTrackRow } from "./rows.js";

export async function runSearch(q, seq, { bumpSeq } = {}) {
  if (seq == null && bumpSeq) seq = bumpSeq();
  dirList.innerHTML = "";
  dirList.classList.remove("album-grid-host");
  let data;
  try {
    data = await apiGet(`/api/search?q=${encodeURIComponent(q)}&limit=50`);
  } catch (err) {
    if (seq != null && !isCurrent(seq)) return;
    showEmpty(dirList, `Error: ${err.message}`);
    return;
  }
  if (seq != null && !isCurrent(seq)) return;

  const artists = data.artists || [];
  const albums = data.albums || [];
  const tracks = data.tracks || [];
  if (!artists.length && !albums.length && !tracks.length) {
    showEmpty(dirList, `No results for “${q}”`);
    return;
  }

  if (artists.length) {
    const label = document.createElement("div");
    label.className = "section-label";
    label.textContent = "Artists";
    dirList.appendChild(label);
    for (const artist of artists) {
      const row = document.createElement("div");
      row.className = "row";
      row.innerHTML = `
        <span class="row-cover-wrap">
          <img class="row-cover" src="${artistImageUrl(artist, "thumb", false)}" alt="" loading="lazy" />
        </span>
        <span class="row-meta"><span class="row-title"></span></span>
        <span class="row-chevron">${icon("chevron-right")}</span>
      `;
      row.querySelector(".row-title").textContent = artist.name;
      row.addEventListener("click", () => {
        nav.push({ kind: "artist", id: artist.id, name: artist.name });
        renderLibrary();
      });
      dirList.appendChild(row);
    }
  }

  if (albums.length) {
    const label = document.createElement("div");
    label.className = "section-label";
    label.textContent = "Albums";
    dirList.appendChild(label);
    for (const album of albums) {
      dirList.appendChild(createAlbumRow(album));
    }
  }

  if (tracks.length) {
    const label = document.createElement("div");
    label.className = "section-label";
    label.textContent = "Tracks";
    dirList.appendChild(label);
    for (const track of tracks) {
      dirList.appendChild(createTrackRow(track));
    }
  }
}
