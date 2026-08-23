/**
 * Browse-mode id from the current route, holding last library when on /queue.
 */
export function effectiveLibraryMode(
  routeMeta: { mode?: unknown; pane?: unknown },
  lastLibraryMode: unknown,
): string {
  if (routeMeta.pane === "queue") {
    return String(lastLibraryMode || "artists");
  }
  return String(routeMeta.mode || "artists");
}
