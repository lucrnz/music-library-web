/**
 * Pure-ish tree layout navigation policy.
 * Enter snapshot + pending focus path live here (not ui.js).
 */
import { reactive } from "vue";

/**
 * @typedef {{ name: string, params: Record<string, string>, query: Record<string, string>, meta: Record<string, unknown> }} RouteSnap
 */

/** @type {RouteSnap|null} */
let enterSnapshot = null;

/** True once we've taken a leave-restore snapshot this session (layout entered tree from list/grid). */
let hasEnterSnapshot = false;

/** Reactive signal so panes can apply focus paths after navigation. */
export const treeNavState = reactive({
  /** @type {string[]|null} */
  pendingFocusPath: null,
  focusGen: 0,
});

/**
 * @param {import('vue-router').RouteLocationNormalizedLoaded | { name?: unknown, params?: object, query?: object, meta?: object }} route
 * @returns {RouteSnap}
 */
export function snapRoute(route) {
  return {
    name: String(route.name || "folders"),
    params: { ...(route.params || {}) },
    query: Object.fromEntries(
      Object.entries(route.query || {}).map(([k, v]) => [
        k,
        v == null ? "" : String(v),
      ])
    ),
    meta: { ...(route.meta || {}) },
  };
}

/**
 * @param {RouteSnap | import('vue-router').RouteLocationNormalizedLoaded} route
 */
export function libraryMode(route) {
  return String(route.meta?.mode || "folders");
}

/**
 * @param {string} mode
 */
export function modeRootLocation(mode) {
  switch (mode) {
    case "artists":
      return { name: "artists", params: {}, query: {} };
    case "albums":
      return { name: "albums", params: {}, query: {} };
    case "downloads":
      return { name: "downloads", params: {}, query: {} };
    default:
      return { name: "folders", params: {}, query: {} };
  }
}

/**
 * @param {RouteSnap | import('vue-router').RouteLocationNormalizedLoaded} route
 */
export function isTreeModeRoot(route) {
  const name = String(route.name || "");
  if (name === "folders") {
    const path = route.query?.path;
    return !path;
  }
  return (
    name === "artists" || name === "albums" || name === "downloads"
  );
}

/**
 * @param {RouteSnap | import('vue-router').RouteLocationNormalizedLoaded} route
 */
export function isTreeCapable(route) {
  if (route.meta?.pane !== "library") return false;
  const mode = libraryMode(route);
  return (
    mode === "folders" ||
    mode === "artists" ||
    mode === "albums" ||
    mode === "downloads"
  );
}

/**
 * Expand keys for auto-focus after coerce to mode root.
 * @param {RouteSnap | import('vue-router').RouteLocationNormalizedLoaded} route
 * @returns {string[]}
 */
export function focusPathFromRoute(route) {
  const name = String(route.name || "");
  const mode = libraryMode(route);

  if (mode === "folders") {
    const path = route.query?.path ? String(route.query.path) : "";
    if (!path) return [];
    const parts = path.split("/").filter(Boolean);
    /** @type {string[]} */
    const keys = [];
    let acc = "";
    for (const p of parts) {
      acc = acc ? `${acc}/${p}` : p;
      keys.push(`dir:${acc}`);
    }
    return keys;
  }

  if (name === "artist" && route.params?.artistId) {
    return [`artist:${String(route.params.artistId)}`];
  }
  if (name === "album" && route.params?.albumId) {
    return [`album:${String(route.params.albumId)}`];
  }
  if (name === "downloads-artist" && route.params?.artistId) {
    return [`dl-artist:${String(route.params.artistId)}`];
  }
  if (name === "downloads-album" && route.params?.albumId) {
    // Parent artist resolved later when hierarchy is known; leaf key alone.
    return [`dl-album:${String(route.params.albumId)}`];
  }
  return [];
}

export function getPendingFocusPath() {
  return treeNavState.pendingFocusPath
    ? [...treeNavState.pendingFocusPath]
    : null;
}

export function clearPendingFocusPath() {
  treeNavState.pendingFocusPath = null;
}

export function setPendingFocusPath(keys) {
  treeNavState.pendingFocusPath = keys?.length ? [...keys] : null;
  treeNavState.focusGen += 1;
}

export function getEnterSnapshot() {
  return enterSnapshot;
}

export function clearEnterSnapshot() {
  enterSnapshot = null;
  hasEnterSnapshot = false;
}

/**
 * @param {{
 *   prevLayout: string,
 *   nextLayout: string,
 *   route: import('vue-router').RouteLocationNormalizedLoaded,
 *   isColdStart?: boolean,
 * }} args
 * @returns {{
 *   replaceTo: { name: string, params?: object, query?: object } | null,
 *   restoreSnapshot: RouteSnap | null,
 *   collapseScope: string | null,
 *   focusPath: string[] | null,
 * }}
 */
export function handleLayoutTransition({
  prevLayout,
  nextLayout,
  route,
  isColdStart = false,
}) {
  /** @type {{ replaceTo: null | object, restoreSnapshot: null | RouteSnap, collapseScope: null | string, focusPath: null | string[] }} */
  const result = {
    replaceTo: null,
    restoreSnapshot: null,
    collapseScope: null,
    focusPath: null,
  };

  const enteringTree =
    nextLayout === "tree" && (prevLayout !== "tree" || isColdStart);

  if (enteringTree) {
    // Cold start already in tree: coerce + focus, never set leave-restore snapshot.
    if (!isColdStart && !hasEnterSnapshot && isTreeCapable(route)) {
      enterSnapshot = snapRoute(route);
      hasEnterSnapshot = true;
    }
    if (isTreeCapable(route)) {
      const focus = focusPathFromRoute(route);
      if (focus.length) {
        setPendingFocusPath(focus);
        result.focusPath = focus;
      }
      if (!isTreeModeRoot(route)) {
        result.replaceTo = modeRootLocation(libraryMode(route));
      }
    }
    return result;
  }

  if (prevLayout === "tree" && nextLayout !== "tree") {
    if (enterSnapshot) {
      result.restoreSnapshot = enterSnapshot;
      enterSnapshot = null;
      hasEnterSnapshot = false;
    }
    clearPendingFocusPath();
    return result;
  }

  return result;
}

/**
 * While layout is tree: coerce deep routes; on mode change collapse.
 * @param {{
 *   route: import('vue-router').RouteLocationNormalizedLoaded,
 *   prevMode: string | null,
 * }} args
 */
export function handleTreeRoute({ route, prevMode }) {
  /** @type {{ replaceTo: null | object, collapseScope: null | string, focusPath: null | string[] }} */
  const result = {
    replaceTo: null,
    collapseScope: null,
    focusPath: null,
  };

  if (!isTreeCapable(route)) return result;

  const mode = libraryMode(route);
  if (prevMode && prevMode !== mode) {
    result.collapseScope = mode;
  }

  if (!isTreeModeRoot(route)) {
    const focus = focusPathFromRoute(route);
    if (focus.length) {
      setPendingFocusPath(focus);
      result.focusPath = focus;
    }
    result.replaceTo = modeRootLocation(mode);
  }

  return result;
}

/**
 * Resolve dl-album-only focus into artist + album keys when hierarchy is known.
 * @param {string[]} path
 * @param {{ artists: { artistId: string, albums: { albumId: string }[] }[] }} hierarchy
 */
export function resolveDownloadsFocusPath(path, hierarchy) {
  if (!path?.length) return path;
  const albumKey = path.find((k) => k.startsWith("dl-album:"));
  if (!albumKey) return path;
  if (path.some((k) => k.startsWith("dl-artist:"))) return path;
  const albumId = albumKey.slice("dl-album:".length);
  for (const ar of hierarchy.artists || []) {
    if (ar.albums?.some((al) => al.albumId === albumId)) {
      return [`dl-artist:${ar.artistId}`, albumKey];
    }
  }
  return path;
}
