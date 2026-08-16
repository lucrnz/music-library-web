/**
 * Pure-ish tree layout navigation policy.
 * Enter snapshot + pending focus path live here (not ui.js).
 */
import { reactive } from "vue";
import type { RouteLocationNormalizedLoaded } from "vue-router";

export interface RouteSnap {
  name: string;
  params: Record<string, string>;
  query: Record<string, string>;
  meta: Record<string, unknown>;
}

export interface RouteReplaceTo {
  name: string;
  params: Record<string, string>;
  query: Record<string, string>;
}

export interface LayoutTransitionResult {
  replaceTo: RouteReplaceTo | null;
  restoreSnapshot: RouteSnap | null;
  collapseScope: string | null;
  focusPath: string[] | null;
}

export interface TreeRouteResult {
  replaceTo: RouteReplaceTo | null;
  collapseScope: string | null;
  focusPath: string[] | null;
}

type RouteLike = RouteSnap | RouteLocationNormalizedLoaded;

let enterSnapshot: RouteSnap | null = null;

/** True once we've taken a leave-restore snapshot this session (layout entered tree from list/grid). */
let hasEnterSnapshot = false;

/** Reactive signal so panes can apply focus paths after navigation. */
export const treeNavState = reactive({
  pendingFocusPath: null as string[] | null,
  focusGen: 0,
});

function firstValue(v: unknown): string {
  if (v == null) return "";
  const raw = Array.isArray(v) ? v[0] : v;
  return raw == null ? "" : String(raw);
}

function paramOf(route: RouteLike, key: string): string {
  return firstValue(route.params?.[key]);
}

function queryOf(route: RouteLike, key: string): string {
  return firstValue(route.query?.[key]);
}

function stringRecord(src: Record<string, unknown> | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(src || {})) {
    out[k] = firstValue(v);
  }
  return out;
}

export function snapRoute(route: RouteLike): RouteSnap {
  return {
    name: String(route.name || "folders"),
    params: stringRecord(route.params as Record<string, unknown> | undefined),
    query: stringRecord(route.query as Record<string, unknown> | undefined),
    meta: { ...(route.meta || {}) },
  };
}

export function libraryMode(route: RouteLike): string {
  return String(route.meta?.mode || "folders");
}

export function modeRootLocation(mode: string): RouteReplaceTo {
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

export function isTreeModeRoot(route: RouteLike): boolean {
  const name = String(route.name || "");
  if (name === "folders") {
    return !queryOf(route, "path");
  }
  return name === "artists" || name === "albums" || name === "downloads";
}

export function isTreeCapable(route: RouteLike): boolean {
  if (route.meta?.pane !== "library") return false;
  const mode = libraryMode(route);
  return (
    mode === "folders" ||
    mode === "artists" ||
    mode === "albums" ||
    mode === "downloads"
  );
}

/** Expand keys for auto-focus after coerce to mode root. */
export function focusPathFromRoute(route: RouteLike): string[] {
  const name = String(route.name || "");
  const mode = libraryMode(route);

  if (mode === "folders") {
    const path = queryOf(route, "path");
    if (!path) return [];
    const parts = path.split("/").filter(Boolean);
    const keys: string[] = [];
    let acc = "";
    for (const p of parts) {
      acc = acc ? `${acc}/${p}` : p;
      keys.push(`dir:${acc}`);
    }
    return keys;
  }

  const artistId = paramOf(route, "artistId");
  const albumId = paramOf(route, "albumId");

  if (name === "artist" && artistId) {
    return [`artist:${artistId}`];
  }
  if (name === "album" && albumId) {
    return [`album:${albumId}`];
  }
  if (name === "downloads-artist" && artistId) {
    return [`dl-artist:${artistId}`];
  }
  if (name === "downloads-album" && albumId) {
    // Parent artist resolved later when hierarchy is known; leaf key alone.
    return [`dl-album:${albumId}`];
  }
  return [];
}

export function getPendingFocusPath(): string[] | null {
  return treeNavState.pendingFocusPath
    ? [...treeNavState.pendingFocusPath]
    : null;
}

export function clearPendingFocusPath(): void {
  treeNavState.pendingFocusPath = null;
}

export function setPendingFocusPath(keys: string[] | null | undefined): void {
  treeNavState.pendingFocusPath = keys?.length ? [...keys] : null;
  treeNavState.focusGen += 1;
}

export function getEnterSnapshot(): RouteSnap | null {
  return enterSnapshot;
}

export function clearEnterSnapshot(): void {
  enterSnapshot = null;
  hasEnterSnapshot = false;
}

export function handleLayoutTransition({
  prevLayout,
  nextLayout,
  route,
  isColdStart = false,
}: {
  prevLayout: string;
  nextLayout: string;
  route: RouteLocationNormalizedLoaded;
  isColdStart?: boolean;
}): LayoutTransitionResult {
  const result: LayoutTransitionResult = {
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
 */
export function handleTreeRoute({
  route,
  prevMode,
}: {
  route: RouteLocationNormalizedLoaded;
  prevMode: string | null;
}): TreeRouteResult {
  const result: TreeRouteResult = {
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
 */
export function resolveDownloadsFocusPath(
  path: string[],
  hierarchy: { artists?: { artistId: string; albums?: { albumId: string }[] }[] },
): string[] {
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
