/**
 * Playlist mutations + playlist view: add/remove/reorder/clear, row
 * rendering, and pointer-based drag reorder.
 */
import {
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
  apiPost,
  coverUrl,
  requestPrepare,
  preparedKeys,
  clearCache,
} from "./api.js";
import { playIndex, stopPlayback } from "./player.js";

/** Filename-based entry for paths /api/meta couldn't resolve. */
function fallbackTrack(path) {
  const name = path.split("/").pop() || path;
  return {
    path,
    title: name.replace(/\.[^.]+$/, ""),
    artist: "",
    album: "",
    duration: null,
  };
}

export async function addPathsToPlaylist(paths) {
  if (!paths.length) return;
  // One batch request for all added paths; /api/meta omits unresolvable
  // paths, so fall back to filename-based entries for those (and for the
  // whole batch if the request itself fails).
  let byPath = new Map();
  try {
    const data = await apiPost("/api/meta", { paths });
    byPath = new Map((data.results || []).map((m) => [m.path, m]));
  } catch (err) {
    console.error(err);
  }
  const items = paths.map((path) => {
    const meta = byPath.get(path);
    if (!meta) return fallbackTrack(path);
    return {
      path,
      title: meta.title || path,
      artist: meta.artist || "",
      album: meta.album || "",
      duration: meta.duration ?? null,
    };
  });
  pl.add(items);
  commit();
  requestPrepare(paths, codec.stream);
}

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
        <img class="row-cover" src="${coverUrl(track.path, "thumb", false)}" alt="" loading="lazy" />
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
