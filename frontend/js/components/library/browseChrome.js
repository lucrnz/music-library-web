/**
 * Pure browse chrome flags for list / grid / tree layouts.
 * No Vue — call from computed() with reactive inputs.
 */

/**
 * @param {{
 *   layout: string,
 *   isSearch: boolean,
 *   mode: string,
 * }} args
 */
export function libraryShowTree({ layout, isSearch, mode }) {
  if (layout !== "tree") return false;
  if (isSearch || mode === "search") return false;
  return mode === "folders" || mode === "artists" || mode === "albums";
}

/**
 * @param {{
 *   isSearch: boolean,
 *   mode: string,
 *   showTree: boolean,
 *   albumId: string | null | undefined,
 *   bodyKind: string,
 * }} args
 */
export function libraryShowLayoutToggle({
  isSearch,
  mode,
  showTree,
  albumId,
  bodyKind,
}) {
  if (isSearch || mode === "search") return false;
  if (showTree) return true;
  if (albumId || bodyKind === "tracks") return false;
  if (bodyKind === "search") return false;
  return mode === "folders" || mode === "artists" || mode === "albums";
}

/**
 * @param {{ layout: string, routeMode: string | undefined }} args
 */
export function downloadsShowTree({ layout, routeMode }) {
  return layout === "tree" && routeMode === "downloads";
}

/**
 * @param {{ showTree: boolean, routeName: string }} args
 */
export function downloadsShowLayoutToggle({ showTree, routeName }) {
  if (showTree) return true;
  return routeName !== "downloads-album";
}

/**
 * @param {{ showLayoutToggle: boolean, layout: string }} args
 */
export function browseIsGrid({ showLayoutToggle, layout }) {
  return showLayoutToggle && layout === "grid";
}

/**
 * @param {{
 *   isGrid: boolean,
 *   bodyKind: string,
 *   pane: 'library' | 'downloads',
 * }} args
 */
export function browseGridHost({ isGrid, bodyKind, pane }) {
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
