/**
 * Library browser: drill-down navigation stack, directory rendering, and
 * desktop Ctrl/Cmd-click multi-select.
 */
import {
  dirList,
  btnBack,
  btnAddAll,
  btnAddSelected,
  libraryTitle,
  audio,
  icon,
  showEmpty,
} from "./dom.js";
import { apiGet } from "./api.js";
import { pl } from "./state.js";
import { playIndex } from "./player.js";
import { addPathsToPlaylist } from "./playlist.js";

/** Library navigation stack: [{ path, name }] — empty means library root. */
let navStack = [];
/** Monotonic id so a stale /api/browse response can't render over a newer navigation. */
let renderDirSeq = 0;
/** Desktop multi-select in the library: path -> 'dir' | 'file' */
const libSelected = new Map();

function currentPath() {
  return navStack.length ? navStack[navStack.length - 1].path : "";
}

function clearLibSelection() {
  libSelected.clear();
  dirList.querySelectorAll(".row.selected").forEach((el) => {
    el.classList.remove("selected");
  });
  syncLibActions();
}

function syncLibActions() {
  btnAddSelected.classList.toggle("hidden", libSelected.size === 0);
}

export async function renderDir() {
  const seq = ++renderDirSeq;
  const path = currentPath();
  libSelected.clear();
  syncLibActions();
  btnBack.classList.toggle("hidden", navStack.length === 0);
  libraryTitle.textContent = navStack.length
    ? navStack[navStack.length - 1].name
    : "Library";
  dirList.innerHTML = "";

  let data;
  try {
    data = await apiGet(`/api/browse?path=${encodeURIComponent(path)}`);
  } catch (err) {
    if (seq !== renderDirSeq) return; // a newer navigation superseded this one
    showEmpty(dirList, `Error: ${err.message}`);
    return;
  }
  if (seq !== renderDirSeq) return;

  if (!data.dirs.length && !data.files.length) {
    showEmpty(dirList, "This folder is empty");
    return;
  }

  for (const dir of data.dirs) {
    dirList.appendChild(createDirRow(dir));
  }
  for (const file of data.files) {
    dirList.appendChild(createFileRow(file));
  }
}

/** Desktop Ctrl/Cmd-click multi-select; returns true if the click was a selection. */
function maybeSelectRow(row, path, kind, e) {
  if (!(e.metaKey || e.ctrlKey)) return false;
  if (libSelected.has(path)) {
    libSelected.delete(path);
    row.classList.remove("selected");
  } else {
    libSelected.set(path, kind);
    row.classList.add("selected");
  }
  syncLibActions();
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
    navStack.push({ path: dir.path, name: dir.name });
    renderDir();
  });
  return row;
}

function createFileRow(file) {
  const row = document.createElement("div");
  row.className = "row";
  row.dataset.path = file.path;
  row.innerHTML = `
    <span class="row-icon">${icon("note")}</span>
    <span class="row-meta">
      <span class="row-title"></span>
    </span>
    <button type="button" class="icon-btn row-add" title="Add to playlist" aria-label="Add to playlist">${icon("plus")}</button>
  `;
  row.querySelector(".row-title").textContent = file.name;

  row.addEventListener("click", async (e) => {
    if (maybeSelectRow(row, file.path, "file", e)) return;
    const startPlay = pl.length === 0 || audio.paused;
    await addPathsToPlaylist([file.path]);
    if (startPlay) {
      playIndex(pl.length - 1);
    }
  });

  row.querySelector(".row-add").addEventListener("click", async (e) => {
    e.stopPropagation();
    await addPathsToPlaylist([file.path]);
  });
  return row;
}

btnBack.addEventListener("click", () => {
  if (!navStack.length) return;
  navStack.pop();
  renderDir();
});

btnAddAll.addEventListener("click", async () => {
  try {
    const data = await apiGet(`/api/collect?path=${encodeURIComponent(currentPath())}`);
    await addPathsToPlaylist(data.files);
  } catch (err) {
    console.error(err);
  }
});

btnAddSelected.addEventListener("click", async () => {
  if (!libSelected.size) return;
  const files = (
    await Promise.all(
      [...libSelected].map(async ([p, kind]) => {
        if (kind !== "dir") return [p];
        try {
          const data = await apiGet(`/api/collect?path=${encodeURIComponent(p)}`);
          return data.files;
        } catch (err) {
          console.error(err);
          return [];
        }
      })
    )
  ).flat();
  clearLibSelection();
  await addPathsToPlaylist(files);
});
