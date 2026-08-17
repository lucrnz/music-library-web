/** Pure enqueue/replace/revert policy for one artist. */

export type PendingAction = "upload" | "revert";

export interface PendingRecord {
  artistId: string;
  action: PendingAction;
  blob?: Blob;
  name: string;
  queuedAt: number;
  preferredRev?: number;
}

export function applyEnqueue(
  current: PendingRecord | undefined,
  incoming: Omit<PendingRecord, "artistId"> & { artistId?: string },
  ctx: { hasLiveOverride: boolean },
): PendingRecord | null {
  const artistId = incoming.artistId || current?.artistId || "";
  if (incoming.action === "upload") {
    return {
      artistId,
      action: "upload",
      blob: incoming.blob,
      name: incoming.name,
      queuedAt: incoming.queuedAt,
      preferredRev: incoming.preferredRev ?? current?.preferredRev,
    };
  }
  const hadUpload = current?.action === "upload";
  if (hadUpload && !ctx.hasLiveOverride) return null;
  if (!ctx.hasLiveOverride && !hadUpload && current?.action !== "revert") {
    return null;
  }
  return {
    artistId,
    action: "revert",
    name: incoming.name,
    queuedAt: incoming.queuedAt,
    preferredRev: incoming.preferredRev ?? current?.preferredRev,
  };
}

export function recordsToFlush(rows: PendingRecord[]): PendingRecord[] {
  return [...rows].sort((a, b) => a.queuedAt - b.queuedAt);
}
