/**
 * Ephemeral UI state (settings already owns modal open).
 */
import { reactive } from "vue";

export type LibraryLayout = "list" | "grid" | "tree";
export type LibSelectionKind = "dir" | "file";

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
  libSelected: Map<string, LibSelectionKind>;
  libraryLayout: LibraryLayout;
  lastLibrary: LibraryRouteSnapshot;
  toast: UiToast | null;
}

const LAYOUT_STORAGE_KEY = "musicweb.libraryLayout.v1";
const TOAST_DEFAULT_MS = 2800;

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

export const ui = reactive<UiState>({
  /** Folder multi-select: path -> 'dir'|'file' */
  libSelected: new Map<string, LibSelectionKind>(),
  /**
   * Global library browse layout (Folders / Artists / Albums / Downloads).
   * Search, queue, and track lists ignore this and stay list.
   */
  libraryLayout: loadLibraryLayout(),
  /**
   * Last library route snapshot so /queue can leave the dual-pane library
   * content intact (and mobile tab can restore drill-down).
   */
  lastLibrary: {
    name: "folders",
    params: {},
    query: {},
    meta: { mode: "folders", pane: "library", title: "Folders" },
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

export function clearLibSelection() {
  ui.libSelected = new Map<string, LibSelectionKind>();
}

export function toggleLibSelection(path: string, kind: LibSelectionKind) {
  const next = new Map(ui.libSelected);
  if (next.has(path)) next.delete(path);
  else next.set(path, kind);
  ui.libSelected = next;
}

export function setLibraryLayout(mode: LibraryLayout) {
  if (mode !== "list" && mode !== "grid" && mode !== "tree") return;
  ui.libraryLayout = mode;
  saveLibraryLayout(mode);
}

export function rememberLibraryRoute(route: {
  name?: string | symbol | null;
  params: Record<string, string | string[]>;
  query: Record<string, unknown>;
  meta?: Record<string, unknown> & { pane?: unknown };
}) {
  if (route.meta?.pane !== "library") return;
  ui.lastLibrary = {
    name: String(route.name || "folders"),
    params: { ...route.params },
    query: { ...route.query },
    meta: { ...route.meta },
  };
}
