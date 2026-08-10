/**
 * Ephemeral UI state (settings already owns modal open).
 */
import { reactive } from "vue";

/** @typedef {"list" | "grid"} LibraryLayout */

const LAYOUT_STORAGE_KEY = "musicweb.libraryLayout.v1";

/** @returns {LibraryLayout} */
function loadLibraryLayout() {
  try {
    const raw = localStorage.getItem(LAYOUT_STORAGE_KEY);
    if (raw === "list" || raw === "grid") return raw;
  } catch {
    /* ignore */
  }
  return "list";
}

/** @param {LibraryLayout} mode */
function saveLibraryLayout(mode) {
  try {
    localStorage.setItem(LAYOUT_STORAGE_KEY, mode);
  } catch {
    /* ignore quota */
  }
}

export const ui = reactive({
  /** Folder multi-select: path -> 'dir'|'file' */
  libSelected: /** @type {Map<string, 'dir'|'file'>} */ (new Map()),
  /**
   * Global library browse layout (Folders / Artists / Albums / Downloads).
   * Search, queue, and track lists ignore this and stay list.
   * @type {LibraryLayout}
   */
  libraryLayout: loadLibraryLayout(),
  /**
   * Last library route snapshot so /queue can leave the dual-pane library
   * content intact (and mobile tab can restore drill-down).
   * @type {{ name: string, params: Record<string, string>, query: Record<string, string>, meta: Record<string, unknown> }}
   */
  lastLibrary: {
    name: "folders",
    params: {},
    query: {},
    meta: { mode: "folders", pane: "library", title: "Folders" },
  },
});

export function clearLibSelection() {
  ui.libSelected = new Map();
}

export function toggleLibSelection(path, kind) {
  const next = new Map(ui.libSelected);
  if (next.has(path)) next.delete(path);
  else next.set(path, kind);
  ui.libSelected = next;
}

/** @param {LibraryLayout} mode */
export function setLibraryLayout(mode) {
  if (mode !== "list" && mode !== "grid") return;
  ui.libraryLayout = mode;
  saveLibraryLayout(mode);
}

export function toggleLibraryLayout() {
  setLibraryLayout(ui.libraryLayout === "grid" ? "list" : "grid");
}

export function rememberLibraryRoute(route) {
  if (route.meta?.pane !== "library") return;
  ui.lastLibrary = {
    name: String(route.name || "folders"),
    params: { ...route.params },
    query: { ...route.query },
    meta: { ...route.meta },
  };
}
