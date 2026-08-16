/**
 * Pure browse chrome flags for list / grid / tree layouts.
 * No Vue — call from computed() with reactive inputs.
 */

export function libraryShowTree({
  layout,
  isSearch,
  mode,
}: {
  layout: string;
  isSearch: boolean;
  mode: string;
}): boolean {
  if (layout !== "tree") return false;
  if (isSearch || mode === "search") return false;
  return mode === "folders" || mode === "artists" || mode === "albums";
}

export function libraryShowLayoutToggle({
  isSearch,
  mode,
  showTree,
  albumId,
  bodyKind,
}: {
  isSearch: boolean;
  mode: string;
  showTree: boolean;
  albumId: string | null | undefined;
  bodyKind: string;
}): boolean {
  if (isSearch || mode === "search") return false;
  if (showTree) return true;
  if (albumId || bodyKind === "tracks") return false;
  if (bodyKind === "search") return false;
  return mode === "folders" || mode === "artists" || mode === "albums";
}

export function downloadsShowTree({
  layout,
  routeMode,
}: {
  layout: string;
  routeMode: string | undefined;
}): boolean {
  return layout === "tree" && routeMode === "downloads";
}

export function downloadsShowLayoutToggle({
  showTree,
  routeName,
}: {
  showTree: boolean;
  routeName: string;
}): boolean {
  if (showTree) return true;
  return routeName !== "downloads-album";
}

export function browseIsGrid({
  showLayoutToggle,
  layout,
}: {
  showLayoutToggle: boolean;
  layout: string;
}): boolean {
  return showLayoutToggle && layout === "grid";
}

export function browseGridHost({
  isGrid,
  bodyKind,
  pane,
}: {
  isGrid: boolean;
  bodyKind: string;
  pane: "library" | "downloads";
}): boolean {
  if (!isGrid) return false;
  if (pane === "downloads") {
    return bodyKind === "artists" || bodyKind === "albumGrid";
  }
  return (
    bodyKind === "folders" ||
    bodyKind === "artists" ||
    bodyKind === "albumGrid"
  );
}
