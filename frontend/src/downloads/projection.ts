/**
 * Catalog projection + UI status join.
 */

import { reactive } from "vue";
import { SOURCE_TAG } from "@/lossyKind";
import type { CatalogTrackRecord } from "@/models/track";
import { settings } from "@/stores/settings";
import { downloads } from "@/downloads/state";

/** Queue states that overlay catalog status for a track. */
export const QUEUE_UI_STATES = new Set(["pending", "active", "failed", "paused"]);

export interface CatalogProjectionEntry {
  codec: string;
  status: string;
}

export type CatalogUiStatus = "ready" | "other" | "failed";

export type DownloadUiStatus =
  | "none"
  | "ready"
  | "other"
  | "failed"
  | "pending"
  | "active"
  | "paused";

/** Catalog-only projection: trackId → { codec, status }. */
const emptyProjection: Record<string, CatalogProjectionEntry> = {};

export const catalogIndex = reactive({
  byTrack: emptyProjection,
});

/** Pure catalog UI status vs preferred download codec. */
export function catalogUiStatus(
  rec: { codec?: string; status?: string } | null | undefined,
  preferredDownloadCodec: string | null | undefined,
): CatalogUiStatus | null {
  if (!rec) return null;
  if (rec.status === "broken") return "failed";
  if (!rec.codec) return null;
  if (rec.codec === SOURCE_TAG) return "ready";
  if (rec.codec !== preferredDownloadCodec) return "other";
  return "ready";
}

function projectionFromRecord(
  rec: CatalogTrackRecord | null | undefined,
): CatalogProjectionEntry | null {
  if (!rec || !rec.trackId || !rec.codec) return null;
  return {
    codec: rec.codec,
    status: rec.status || "ready",
  };
}

/** Replace entire catalog projection (boot hydrate). */
export function setCatalogProjectionMap(
  map: Record<string, CatalogProjectionEntry> | null | undefined,
) {
  catalogIndex.byTrack = map && typeof map === "object" ? map : {};
}

/** Upsert or remove one catalog projection entry after an IDB track write. */
export function syncCatalogProjection(
  trackId: string,
  rec: CatalogTrackRecord | null | undefined,
) {
  if (!trackId) return;
  const next = { ...catalogIndex.byTrack };
  const proj = projectionFromRecord(rec);
  if (proj) next[trackId] = proj;
  else delete next[trackId];
  catalogIndex.byTrack = next;
}

/** Clear catalog projection (wipe / disable with wipe). */
export function clearCatalogProjection() {
  catalogIndex.byTrack = {};
}

/**
 * Pure join: queue overlay wins, else catalog vs preferred codec.
 */
export function joinDownloadUiStatus(
  trackId: string,
  ctx: {
    enabled?: boolean;
    queue?: Array<{ trackId: string; state: string }>;
    preferredCodec?: string;
    byTrack?: Record<string, CatalogProjectionEntry>;
  } = {},
): DownloadUiStatus {
  const enabled = ctx.enabled ?? downloads.enabled;
  if (!enabled || !trackId) return "none";

  const queue = ctx.queue ?? downloads.queue;
  let queueState: string | null = null;
  for (const q of queue) {
    if (q.trackId === trackId && QUEUE_UI_STATES.has(q.state)) {
      queueState = q.state;
    }
  }
  if (
    queueState === "pending" ||
    queueState === "active" ||
    queueState === "failed" ||
    queueState === "paused"
  ) {
    return queueState;
  }

  const byTrack = ctx.byTrack ?? catalogIndex.byTrack;
  const proj = byTrack[trackId];
  if (!proj) return "none";

  const preferred =
    ctx.preferredCodec != null ? ctx.preferredCodec : settings.download;
  const st = catalogUiStatus(
    { codec: proj.codec, status: proj.status },
    preferred
  );
  return st || "none";
}

/** Reactive-friendly read for components (call inside computed). */
export function trackDownloadState(trackId: string) {
  return joinDownloadUiStatus(trackId, {
    enabled: downloads.enabled,
    queue: downloads.queue,
    preferredCodec: settings.download,
    byTrack: catalogIndex.byTrack,
  });
}

/** True when the catalog has a playable local file (ready or other quality). */
export function isLocallyPlayableDownload(trackId: string) {
  const st = trackDownloadState(trackId);
  return st === "ready" || st === "other";
}
