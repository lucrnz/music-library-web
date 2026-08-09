/**
 * Ephemeral UI state (settings already owns modal open).
 */
import { reactive } from "vue";

export const ui = reactive({
  /** Folder multi-select: path -> 'dir'|'file' */
  libSelected: /** @type {Map<string, 'dir'|'file'>} */ (new Map()),
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

export function rememberLibraryRoute(route) {
  if (route.meta?.pane !== "library") return;
  ui.lastLibrary = {
    name: String(route.name || "folders"),
    params: { ...route.params },
    query: { ...route.query },
    meta: { ...route.meta },
  };
}
