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
  return mode === "artists" || mode === "albums" || mode === "downloads";
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
  return mode === "artists" || mode === "albums" || mode === "downloads";
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
}: {
  isGrid: boolean;
  bodyKind: string;
}): boolean {
  if (!isGrid) return false;
  return bodyKind === "artists" || bodyKind === "albumGrid";
}
