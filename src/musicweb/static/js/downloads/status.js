/**
 * Download UI status: pure on-read join of queue + catalog projection.
 *
 * Queue overlay is always computed at read time from the reactive queue.
 * Catalog projection is catalog-only (codec/status) and updated solely when
 * IDB track records change — never when queue ticks.
 */

import { reactive } from "vue";
import { settings } from "../stores/settings.js";
import { downloads } from "./state.js";

/** Queue states that overlay catalog status for a track. */
export const QUEUE_UI_STATES = new Set(["pending", "active", "failed", "paused"]);

/**
 * Catalog-only projection: trackId → { codec, status }.
 * Single writer: hydrate (index) + records-layer hooks.
 * @type {{ byTrack: Record<string, { codec: string, status: string }> }}
 */
export const catalogIndex = reactive({
  byTrack: /** @type {Record<string, { codec: string, status: string }>} */ ({}),
});

/**
 * Pure catalog UI status vs preferred download codec.
 * @param {object|null|undefined} rec
 * @param {string} preferredDownloadCodec
 * @returns {'ready'|'other'|'failed'|null}
 */
export function catalogUiStatus(rec, preferredDownloadCodec) {
  if (!rec) return null;
  if (rec.status === "broken") return "failed";
  if (!rec.codec) return null;
  if (rec.codec !== preferredDownloadCodec) return "other";
  return "ready";
}

/**
 * @param {object|null|undefined} rec
 * @returns {{ codec: string, status: string }|null}
 */
function projectionFromRecord(rec) {
  if (!rec || !rec.trackId || !rec.codec) return null;
  return {
    codec: rec.codec,
    status: rec.status || "ready",
  };
}

/**
 * Replace entire catalog projection (boot hydrate).
 * @param {Record<string, { codec: string, status: string }>} map
 */
export function setCatalogProjectionMap(map) {
  catalogIndex.byTrack = map && typeof map === "object" ? map : {};
}

/**
 * Upsert or remove one catalog projection entry after an IDB track write.
 * @param {string} trackId
 * @param {object|null|undefined} rec full track record, or null to remove
 */
export function syncCatalogProjection(trackId, rec) {
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
 *
 * @param {string} trackId
 * @param {{
 *   enabled?: boolean,
 *   queue?: object[],
 *   preferredCodec?: string,
 *   byTrack?: Record<string, { codec: string, status: string }>,
 * }} [ctx]
 * @returns {'none'|'ready'|'other'|'failed'|'pending'|'active'|'paused'}
 */
export function joinDownloadUiStatus(trackId, ctx = {}) {
  const enabled = ctx.enabled ?? downloads.enabled;
  if (!enabled || !trackId) return "none";

  const queue = ctx.queue ?? downloads.queue;
  let queueState = null;
  for (const q of queue) {
    if (q.trackId === trackId && QUEUE_UI_STATES.has(q.state)) {
      queueState = q.state;
    }
  }
  if (queueState) return queueState;

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

/**
 * Reactive-friendly read for components (call inside computed).
 * Touches downloads.queue, downloads.enabled, settings.download, catalogIndex.
 * @param {string} trackId
 */
export function trackDownloadState(trackId) {
  return joinDownloadUiStatus(trackId, {
    enabled: downloads.enabled,
    queue: downloads.queue,
    preferredCodec: settings.download,
    byTrack: catalogIndex.byTrack,
  });
}
