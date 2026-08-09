/**
 * Filesystem folder drill-down + multi-select.
 */
import { dirList, audio, icon, showEmpty } from "../dom.js";
import { apiGet, apiPost, coverUrl } from "../api.js";
import { pl } from "../state.js";
import { playIndex } from "../player.js";
import { addToQueue } from "../playlist.js";
import * as nav from "./nav.js";
import { isCurrent, renderLibrary } from "./context.js";
import { formatTrackLabel } from "./rows.js";

/** @type {Map<string, 'dir'|'file'>} */
export const libSelected = new Map();

/** @type {() => void} */
let onSelectionChange = () => {};

export function setSelectionChangeHandler(fn) {
  onSelectionChange = fn;
}

export function clearLibSelection() {
  libSelected.clear();
  dirList.querySelectorAll(".row.selected").forEach((el) => {
    el.classList.remove("selected");
  });
  onSelectionChange();
}

function maybeSelectRow(row, path, kind, e) {
  if (!(e.metaKey || e.ctrlKey)) return false;
  if (libSelected.has(path)) {
    libSelected.delete(path);
    row.classList.remove("selected");
  } else {
    libSelected.set(path, kind);
    row.classList.add("selected");
  }
  onSelectionChange();
  return true;
}

function createDirRow(dir) {
  const row = document.createElement("div");
  row.className = "row";
  row.dataset.path = dir.path;
  row.innerHTML = `
    <span class="row-icon">${icon("folder")}</span>
    <span class="row-meta">
      <span class="row-title"></span>
    </span>
    <span class="row-chevron">${icon("chevron-right")}</span>
  `;
  row.querySelector(".row-title").textContent = dir.name;
  row.addEventListener("click", (e) => {
    if (maybeSelectRow(row, dir.path, "dir", e)) return;
    nav.push({ kind: "folder", path: dir.path, name: dir.name });
    renderLibrary();
  });
  return row;
}

function createFileRow(file) {
  const row = document.createElement("div");
  row.className = "row";
  row.dataset.path = file.path;
  if (file.id) row.dataset.id = file.id;
  const coverSrc = file.id
    ? coverUrl({ id: file.id }, "thumb", false)
    : "/static/img/placeholder.svg";
  row.innerHTML = `
    <span class="row-cover-wrap">
      <img class="row-cover" src="${coverSrc}" alt="" loading="lazy" />
    </span>
    <span class="row-meta">
      <span class="row-title"></span>
    </span>
    <button type="button" class="icon-btn row-add" title="Add to playlist" aria-label="Add to playlist">${icon("plus")}</button>
  `;
  row.querySelector(".row-title").textContent = file.name;
  const playable = Boolean(file.id);

  row.addEventListener("click", async (e) => {
    if (maybeSelectRow(row, file.path, "file", e)) return;
    if (!playable) return;
    const startPlay = pl.length === 0 || audio.paused;
    await addToQueue([{ id: file.id }]);
    if (startPlay) playIndex(pl.length - 1);
  });

  row.querySelector(".row-add").addEventListener("click", async (e) => {
    e.stopPropagation();
    if (!playable) return;
    await addToQueue([{ id: file.id }]);
  });
  return row;
}

export function currentFolderPath() {
  const top = nav.peek();
  return top?.kind === "folder" ? top.path || "" : "";
}

export async function renderFolders(seq) {
  dirList.innerHTML = "";
  const path = currentFolderPath();
  let data;
  try {
    data = await apiGet(`/api/browse?path=${encodeURIComponent(path)}`);
  } catch (err) {
    if (!isCurrent(seq)) return;
    showEmpty(dirList, `Error: ${err.message}`);
    return;
  }
  if (!isCurrent(seq)) return;

  if (!data.dirs.length && !data.files.length) {
    showEmpty(dirList, "This folder is empty");
    return;
  }

  for (const dir of data.dirs) {
    dirList.appendChild(createDirRow(dir));
  }

  const fileTitleEls = new Map();
  const ids = [];
  for (const file of data.files) {
    const row = createFileRow(file);
    if (file.id) {
      fileTitleEls.set(file.id, row.querySelector(".row-title"));
      ids.push(file.id);
    }
    dirList.appendChild(row);
  }

  if (!ids.length) return;
  try {
    const meta = await apiPost("/api/tracks/meta", { ids });
    if (!isCurrent(seq)) return;
    for (const m of meta.results || []) {
      const el = fileTitleEls.get(m.id);
      if (el) el.textContent = formatTrackLabel(m);
      const img = dirList.querySelector(
        `.row[data-id="${CSS.escape(m.id)}"] .row-cover`
      );
      if (img) img.src = coverUrl(m, "thumb", false);
    }
  } catch (err) {
    console.error(err);
  }
}

export async function collectSelectedIds() {
  const files = (
    await Promise.all(
      [...libSelected].map(async ([p]) => {
        try {
          const data = await apiGet(`/api/collect?path=${encodeURIComponent(p)}`);
          return (data.files || []).filter((f) => f.id);
        } catch (err) {
          console.error(err);
          return [];
        }
      })
    )
  ).flat();
  return files;
}
