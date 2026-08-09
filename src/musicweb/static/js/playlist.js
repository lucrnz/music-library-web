/**
 * Playlist mutations + playlist view: add/remove/reorder/clear, row
 * rendering, and pointer-based drag reorder.
 */
import {
  $,
  plList,
  btnEdit,
  btnClear,
  audio,
  icon,
  formatTime,
  showEmpty,
} from "./dom.js";
import { pl, codec, commit } from "./state.js";
import {
  apiGet,
  apiPost,
  apiPut,
  apiDelete,
  coverUrl,
  requestPrepare,
  preparedKeys,
  clearCache,
} from "./api.js";
import { playIndex, stopPlayback } from "./player.js";

function normalizeTrack(meta) {
  return {
    id: meta.id || null,
    path: meta.path || null,
    title: meta.title || "Unknown",
    artist: meta.artist || "",
    album: meta.album || "",
    album_id: meta.album_id || null,
    duration: meta.duration ?? null,
  };
}

/**
 * Add tracks to the session queue (id-primary).
 * Accepts full track dicts from the API, or {id} / id strings.
 */
export async function addToQueue(entries) {
  if (!entries?.length) return;

  const ids = [];
  const preloaded = [];

  for (const entry of entries) {
    if (typeof entry === "string") {
      ids.push(entry);
    } else if (entry && typeof entry === "object") {
      if (entry.title && entry.id) {
        preloaded.push(normalizeTrack(entry));
      } else if (entry.id) {
        ids.push(entry.id);
      }
    }
  }

  const items = [...preloaded];

  if (ids.length) {
    try {
      const data = await apiPost("/api/tracks/meta", { ids });
      const byId = new Map((data.results || []).map((m) => [m.id, m]));
      for (const id of ids) {
        const meta = byId.get(id);
        if (meta) items.push(normalizeTrack(meta));
      }
    } catch (err) {
      console.error(err);
    }
  }

  const playable = items.filter((t) => t.id);
  if (!playable.length) return;
  pl.add(playable);
  commit();
  requestPrepare(playable, codec.stream);
}

/** @deprecated use addToQueue */
export const addPathsToPlaylist = addToQueue;
export const addTracksToPlaylist = addToQueue;

function removeIndices(indices) {
  if (!indices.length) return;
  const removingCurrent = pl.removeIndices(indices);
  commit();
  if (removingCurrent) {
    if (pl.length && pl.index >= 0) playIndex(pl.index);
    else stopPlayback();
  }
}

function clearPlaylist() {
  pl.clear();
  stopPlayback();
  // Cached streams only exist to serve the playlist — wipe them too.
  preparedKeys.clear();
  clearCache("streams");
}

/** Playlist edit mode (delete / reorder / clear). */
let plEditing = false;

export function renderPlaylist() {
  plList.innerHTML = "";
  plList.classList.toggle("editing", plEditing);
  btnEdit.querySelector("span").textContent = plEditing ? "Done" : "Edit";
  btnClear.classList.toggle("hidden", !plEditing || !pl.length);

  if (!pl.length) {
    showEmpty(
      plList,
      plEditing
        ? "Playlist is empty"
        : "Playlist empty — tap tracks in the Library to add them"
    );
    return;
  }

  pl.tracks.forEach((track, index) => {
    const row = document.createElement("div");
    row.className = "row";
    row.dataset.index = String(index);
    if (index === pl.index) row.classList.add("playing");

    const sub = [track.artist, track.album].filter(Boolean).join(" — ");
    row.innerHTML = `
      <button type="button" class="icon-btn row-delete" title="Remove" aria-label="Remove from playlist">${icon("trash")}</button>
      <span class="row-cover-wrap">
        <img class="row-cover" src="${coverUrl(track, "thumb", false)}" alt="" loading="lazy" />
        ${index === pl.index
          ? `<span class="eq${audio.paused ? " paused" : ""}"><span></span><span></span><span></span></span>`
          : ""}
      </span>
      <span class="row-meta">
        <span class="row-title"></span>
        <span class="row-sub"></span>
      </span>
      <span class="row-dur">${formatTime(track.duration)}</span>
      <span class="row-drag" title="Drag to reorder" aria-label="Drag to reorder">${icon("drag")}</span>
    `;
    row.querySelector(".row-title").textContent = track.title;
    row.querySelector(".row-sub").textContent = sub;

    row.addEventListener("click", (e) => {
      if (plEditing) return;
      if (e.target.closest(".row-delete") || e.target.closest(".row-drag")) return;
      playIndex(index);
    });

    row.querySelector(".row-delete").addEventListener("click", () => {
      removeIndices([index]);
    });

    row.querySelector(".row-drag").addEventListener("pointerdown", (e) => {
      startDragReorder(e, row, index);
    });

    plList.appendChild(row);
  });
}

/** Pointer-based drag reorder — works for touch and mouse. */
function startDragReorder(e, row, fromIndex) {
  e.preventDefault();
  let targetIndex = fromIndex;
  let marked = null;
  row.classList.add("dragging");

  const onMove = (ev) => {
    const el = document.elementFromPoint(ev.clientX, ev.clientY);
    const over = el ? el.closest(".row") : null;
    if (marked && marked !== over) marked.classList.remove("drop-target");
    marked = null;
    if (over && over.parentElement === plList && over !== row) {
      targetIndex = Number(over.dataset.index);
      over.classList.add("drop-target");
      marked = over;
    }
  };
  const onUp = () => {
    document.removeEventListener("pointermove", onMove);
    document.removeEventListener("pointerup", onUp);
    row.classList.remove("dragging");
    if (marked) marked.classList.remove("drop-target");
    if (targetIndex !== fromIndex) reorderPlaylist(fromIndex, targetIndex);
  };
  document.addEventListener("pointermove", onMove);
  document.addEventListener("pointerup", onUp);
}

function reorderPlaylist(from, to) {
  pl.reorder(from, to);
  commit();
}

btnEdit.addEventListener("click", () => {
  plEditing = !plEditing;
  renderPlaylist();
});

btnClear.addEventListener("click", clearPlaylist);

// ── Saved playlists (server SQLite) ──────────────────────────────────
const savedPlList = $("saved-pl-list");
const btnSavePl = $("btn-save-pl");

export async function renderSavedPlaylists() {
  if (!savedPlList) return;
  savedPlList.innerHTML = "";
  let data;
  try {
    data = await apiGet("/api/playlists");
  } catch (err) {
    console.error(err);
    return;
  }
  const items = data.items || [];
  if (!items.length) {
    const hint = document.createElement("div");
    hint.className = "saved-pl-hint";
    hint.textContent = "Saved playlists appear here (shared on the LAN).";
    savedPlList.appendChild(hint);
    return;
  }
  for (const sp of items) {
    const row = document.createElement("div");
    row.className = "saved-pl-row";
    row.innerHTML = `
      <button type="button" class="saved-pl-load">
        <span class="saved-pl-name"></span>
        <span class="saved-pl-count"></span>
      </button>
      <button type="button" class="icon-btn saved-pl-del" title="Delete playlist" aria-label="Delete playlist">${icon("trash")}</button>
    `;
    row.querySelector(".saved-pl-name").textContent = sp.name;
    row.querySelector(".saved-pl-count").textContent = `${sp.track_count} tracks`;
    row.querySelector(".saved-pl-load").addEventListener("click", async () => {
      try {
        const full = await apiGet(`/api/playlists/${encodeURIComponent(sp.id)}/tracks`);
        const tracks = (full.items || []).filter((t) => !t.is_missing && t.id);
        if (!tracks.length) return;
        pl.clear();
        await addToQueue(tracks);
        if (pl.length) playIndex(0);
      } catch (err) {
        console.error(err);
      }
    });
    row.querySelector(".saved-pl-del").addEventListener("click", async (e) => {
      e.stopPropagation();
      if (!confirm(`Delete playlist “${sp.name}”?`)) return;
      try {
        await apiDelete(`/api/playlists/${encodeURIComponent(sp.id)}`);
        renderSavedPlaylists();
      } catch (err) {
        console.error(err);
      }
    });
    savedPlList.appendChild(row);
  }
}

btnSavePl?.addEventListener("click", async () => {
  const ids = pl.tracks.map((t) => t.id).filter(Boolean);
  if (!ids.length) {
    alert("Queue has no indexed tracks to save (wait for scan / use Artists or Albums).");
    return;
  }
  const name = prompt("Playlist name", `Playlist ${new Date().toLocaleDateString()}`);
  if (!name || !name.trim()) return;
  try {
    const created = await apiPost("/api/playlists", { name: name.trim() });
    await apiPut(`/api/playlists/${encodeURIComponent(created.id)}/tracks`, {
      track_ids: ids,
    });
    renderSavedPlaylists();
  } catch (err) {
    console.error(err);
    alert(`Could not save playlist: ${err.message}`);
  }
});
