/**
 * Library browser coordinator: mode chrome + wiring.
 * Views live in static/js/browse/.
 */
import {
  dirList,
  btnBack,
  btnAddAll,
  btnAddSelected,
  libraryTitle,
  showEmpty,
  $,
} from "./dom.js";
import { apiGet } from "./api.js";
import { addToQueue } from "./playlist.js";
import * as nav from "./browse/nav.js";
import { bind as bindBrowseContext } from "./browse/context.js";
import {
  clearLibSelection,
  collectSelectedIds,
  currentFolderPath,
  libSelected,
  renderFolders,
  setSelectionChangeHandler,
} from "./browse/folders.js";
import {
  renderAlbumList,
  renderAlbumTracks,
  renderArtistAlbums,
  renderArtistList,
} from "./browse/discovery.js";
import { runSearch } from "./browse/search.js";

let renderSeq = 0;
let searchTimer = null;

function isCurrent(seq) {
  return seq === renderSeq;
}

function bumpSeq() {
  return ++renderSeq;
}

export async function renderLibrary() {
  const seq = bumpSeq();
  clearLibSelection();
  setModeButtons();
  syncLibActions();
  dirList.classList.remove("album-grid-host");

  if (nav.mode === "folders") {
    btnBack.classList.toggle("hidden", nav.depth() === 0);
    libraryTitle.textContent = nav.depth() ? nav.peek().name : "Folders";
    return renderFolders(seq);
  }

  if (nav.mode === "search" && !nav.depth()) {
    btnBack.classList.add("hidden");
    libraryTitle.textContent = "Search";
    const q = ($("library-search")?.value || "").trim();
    if (!q) {
      dirList.innerHTML = "";
      showEmpty(dirList, "Type to search the library index");
      return;
    }
    return runSearch(q, seq);
  }

  btnBack.classList.toggle("hidden", nav.depth() === 0);
  if (!nav.depth()) {
    libraryTitle.textContent = nav.mode === "artists" ? "Artists" : "Albums";
    if (nav.mode === "artists") return renderArtistList(seq);
    if (nav.mode === "albums") return renderAlbumList(seq);
    return;
  }

  const top = nav.peek();
  libraryTitle.textContent = top.name;
  if (top.kind === "artist") return renderArtistAlbums(seq, top.id);
  if (top.kind === "album") return renderAlbumTracks(seq, top.id);
}

bindBrowseContext({ renderLibrary, isCurrent });

function syncLibActions() {
  const folderRoot = nav.mode === "folders";
  btnAddAll.classList.toggle("hidden", !folderRoot && nav.depth() === 0);
  btnAddSelected.classList.toggle(
    "hidden",
    nav.mode !== "folders" || libSelected.size === 0
  );
}

function setModeButtons() {
  for (const m of ["folders", "artists", "albums", "search"]) {
    const btn = $(`mode-${m}`);
    if (!btn) continue;
    const active = nav.mode === m;
    btn.classList.toggle("active", active);
    btn.setAttribute("aria-selected", String(active));
  }
  $("search-bar")?.classList.toggle("hidden", nav.mode !== "search");
  btnAddAll.classList.toggle(
    "hidden",
    nav.mode === "search" && nav.depth() === 0
  );
}

export function setBrowseMode(mode) {
  if (!["folders", "artists", "albums", "search"].includes(mode)) return;
  nav.setMode(mode);
  clearLibSelection();
  dirList.classList.remove("album-grid-host");
  setModeButtons();
  renderLibrary();
  if (mode === "search") {
    const input = $("library-search");
    input?.focus();
    if (input?.value?.trim()) runSearch(input.value.trim(), null, { bumpSeq });
  }
}

export async function renderDir() {
  return renderLibrary();
}

setSelectionChangeHandler(syncLibActions);

btnBack.addEventListener("click", () => {
  if (!nav.depth()) return;
  nav.pop();
  renderLibrary();
});

btnAddAll.addEventListener("click", async () => {
  try {
    if (nav.mode === "folders") {
      const data = await apiGet(
        `/api/collect?path=${encodeURIComponent(currentFolderPath())}`
      );
      await addToQueue((data.files || []).filter((f) => f.id));
      return;
    }
    const top = nav.peek();
    if (top?.kind === "album") {
      const data = await apiGet(
        `/api/albums/${encodeURIComponent(top.id)}/tracks`
      );
      await addToQueue(data.items || []);
    } else if (top?.kind === "artist") {
      const data = await apiGet(
        `/api/artists/${encodeURIComponent(top.id)}/albums`
      );
      const all = [];
      for (const album of data.items || []) {
        const tr = await apiGet(
          `/api/albums/${encodeURIComponent(album.id)}/tracks`
        );
        all.push(...(tr.items || []));
      }
      await addToQueue(all);
    }
  } catch (err) {
    console.error(err);
  }
});

btnAddSelected.addEventListener("click", async () => {
  if (!libSelected.size) return;
  const files = await collectSelectedIds();
  clearLibSelection();
  await addToQueue(files);
});

for (const mode of ["folders", "artists", "albums", "search"]) {
  $(`mode-${mode}`)?.addEventListener("click", () => setBrowseMode(mode));
}

const searchInput = $("library-search");
searchInput?.addEventListener("input", () => {
  if (nav.mode !== "search") return;
  const q = searchInput.value.trim();
  if (searchTimer) clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    if (!q) {
      dirList.innerHTML = "";
      showEmpty(dirList, "Type to search the library index");
      return;
    }
    runSearch(q, null, { bumpSeq });
  }, 250);
});
searchInput?.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    const q = searchInput.value.trim();
    if (q) runSearch(q, null, { bumpSeq });
  }
});
