/**
 * Ephemeral UI state (settings already owns modal open).
 */
import { reactive } from "vue";

export type LibraryLayout = "list" | "grid" | "tree";

export interface LibraryRouteSnapshot {
  name: string;
  params: Record<string, string | string[]>;
  query: Record<string, unknown>;
  meta: Record<string, unknown>;
}

export interface UiToast {
  id: number;
  message: string;
}

export interface UiState {
  libraryLayout: LibraryLayout;
  /**
   * Desktop library pane width in CSS pixels. `null` keeps the CSS default
   * (percentage + max-width). Mobile ignores this.
   */
  libraryPaneWidthPx: number | null;
  lastLibrary: LibraryRouteSnapshot;
  toast: UiToast | null;
}

const LAYOUT_STORAGE_KEY = "musicweb.libraryLayout.v1";
const PANE_WIDTH_STORAGE_KEY = "musicweb.libraryPaneWidth.v1";
const TOAST_DEFAULT_MS = 2800;

/** Narrowest library pane the desktop splitter will set. */
export const LIBRARY_PANE_MIN_PX = 240;
/** Queue keeps at least this much of `main` when the library pane is custom. */
export const LIBRARY_PANE_QUEUE_MIN_PX = 280;

let toastTimer: ReturnType<typeof setTimeout> | null = null;
let toastSeq = 0;

function loadLibraryLayout(): LibraryLayout {
  try {
    const raw = localStorage.getItem(LAYOUT_STORAGE_KEY);
    if (raw === "list" || raw === "grid" || raw === "tree") return raw;
  } catch {
    /* ignore */
  }
  return "list";
}

function saveLibraryLayout(mode: LibraryLayout) {
  try {
    localStorage.setItem(LAYOUT_STORAGE_KEY, mode);
  } catch {
    /* ignore quota */
  }
}

/** Parse a stored pane width. Rejects missing, non-numeric, and too-narrow values. */
export function parseLibraryPaneWidth(raw: string | null): number | null {
  if (raw == null || raw === "") return null;
  const n = Math.round(Number(raw));
  if (!Number.isFinite(n) || n < LIBRARY_PANE_MIN_PX) return null;
  return n;
}

function loadLibraryPaneWidth(): number | null {
  try {
    return parseLibraryPaneWidth(localStorage.getItem(PANE_WIDTH_STORAGE_KEY));
  } catch {
    return null;
  }
}

function saveLibraryPaneWidth(px: number | null) {
  try {
    if (px == null) localStorage.removeItem(PANE_WIDTH_STORAGE_KEY);
    else localStorage.setItem(PANE_WIDTH_STORAGE_KEY, String(px));
  } catch {
    /* ignore quota */
  }
}

/**
 * Clamp a dragged/keyboard width so the library stays at least
 * `LIBRARY_PANE_MIN_PX` and the queue keeps `LIBRARY_PANE_QUEUE_MIN_PX`.
 */
export function clampLibraryPaneWidth(width: number, availablePx: number): number {
  const w = Math.round(Number(width));
  if (!Number.isFinite(w)) return LIBRARY_PANE_MIN_PX;
  const avail = Number.isFinite(availablePx) ? availablePx : 0;
  const max = Math.max(
    LIBRARY_PANE_MIN_PX,
    Math.floor(avail - LIBRARY_PANE_QUEUE_MIN_PX),
  );
  return Math.min(max, Math.max(LIBRARY_PANE_MIN_PX, w));
}

export const ui = reactive<UiState>({
  /**
   * Global library browse layout (Artists / Albums / Downloads).
   * Search, queue, and track lists ignore this and stay list.
   */
  libraryLayout: loadLibraryLayout(),
  libraryPaneWidthPx: loadLibraryPaneWidth(),
  /**
   * Last library route snapshot so /queue can leave the dual-pane library
   * content intact (and mobile tab can restore drill-down).
   */
  lastLibrary: {
    name: "artists",
    params: {},
    query: {},
    meta: { mode: "artists", pane: "library", title: "Artists" },
  },
  /** Short-lived global toast (connectivity transitions, etc.). */
  toast: null,
});

/**
 * Show a muted auto-dismissing toast. Replaces any existing toast.
 */
export function showToast(message: string, durationMs = TOAST_DEFAULT_MS) {
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

export function setLibraryLayout(mode: LibraryLayout) {
  if (mode !== "list" && mode !== "grid" && mode !== "tree") return;
  ui.libraryLayout = mode;
  saveLibraryLayout(mode);
}

/** Persist a custom desktop library pane width, or `null` to restore the CSS default. */
export function setLibraryPaneWidth(px: number | null) {
  if (px == null) {
    ui.libraryPaneWidthPx = null;
    saveLibraryPaneWidth(null);
    return;
  }
  const n = Math.round(Number(px));
  if (!Number.isFinite(n) || n < LIBRARY_PANE_MIN_PX) return;
  ui.libraryPaneWidthPx = n;
  saveLibraryPaneWidth(n);
}

export function rememberLibraryRoute(route: {
  name?: string | symbol | null;
  params: Record<string, string | string[]>;
  query: Record<string, unknown>;
  meta?: Record<string, unknown> & { pane?: unknown };
}) {
  if (route.meta?.pane !== "library") return;
  ui.lastLibrary = {
    name: String(route.name || "artists"),
    params: { ...route.params },
    query: { ...route.query },
    meta: { ...route.meta },
  };
}
