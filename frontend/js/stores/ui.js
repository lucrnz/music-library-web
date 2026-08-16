/**
 * Ephemeral UI state (settings already owns modal open).
 */
import { reactive } from "vue";

/** @typedef {"list" | "grid" | "tree"} LibraryLayout */

const LAYOUT_STORAGE_KEY = "musicweb.libraryLayout.v1";
const TOAST_DEFAULT_MS = 2800;

/** @type {ReturnType<typeof setTimeout> | null} */
let toastTimer = null;
let toastSeq = 0;

/** @returns {LibraryLayout} */
function loadLibraryLayout() {
  try {
    const raw = localStorage.getItem(LAYOUT_STORAGE_KEY);
    if (raw === "list" || raw === "grid" || raw === "tree") return raw;
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
  /**
   * Short-lived global toast (connectivity transitions, etc.).
   * @type {{ id: number, message: string } | null}
   */
  toast: null,
});

/**
 * Show a muted auto-dismissing toast. Replaces any existing toast.
 * @param {string} message
 * @param {number} [durationMs]
 */
export function showToast(message, durationMs = TOAST_DEFAULT_MS) {
  const text = String(message || "").trim();
  if (!text) return;
  if (toastTimer) {
    clearTimeout(toastTimer);
    toastTimer = null;
  }
  toastSeq += 1;
  const id = toastSeq;
  ui.toast = { id, message: text };
  toastTimer = setTimeout(() => {
    toastTimer = null;
    if (ui.toast?.id === id) ui.toast = null;
  }, Math.max(0, durationMs));
}

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
  if (mode !== "list" && mode !== "grid" && mode !== "tree") return;
  ui.libraryLayout = mode;
  saveLibraryLayout(mode);
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
