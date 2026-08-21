/**
 * Shared stream prepare for queue add, settings codec change, and near-end.
 */
import { apiFetch, apiPost } from "@/api";
import { catalogIndex } from "@/downloads/catalog";
import { willPreferLocal } from "@/downloads/resolve";
import type { Track } from "@/models/track";
import {
  getExclusiveProfileTag,
  isExclusiveEnabled,
} from "@/stores/exclusiveAudio";
import { getActiveStreamCodec, settings } from "@/stores/settings";

export interface PrepareTracksOpts {
  urgent?: boolean;
  replace?: boolean;
  limit?: number;
}

/** Keys already prepared: "id|codec" */
export const preparedKeys = new Set<string>();

const FORGET_CHUNK = 1000;

/** POST /api/transcode/forget — fire-and-forget discarded queue ids. */
export function requestForget(ids: string[]): void {
  const unique = [...new Set(ids.filter((id) => !!id))];
  if (!unique.length) return;
  for (const id of unique) {
    const prefix = `${id}|`;
    for (const key of [...preparedKeys]) {
      if (key.startsWith(prefix)) preparedKeys.delete(key);
    }
  }
  for (let i = 0; i < unique.length; i += FORGET_CHUNK) {
    const chunk = unique.slice(i, i + FORGET_CHUNK);
    void apiPost("/api/transcode/forget", { ids: chunk }).catch(() => {});
  }
}

/**
 * Prewarm by track ids (or track objects with .id).
 * urgent: near-end / play-priority prepare. Always POSTs (even if already
 * in preparedKeys) so a pending prewarm job can be promoted server-side.
 */
export function requestPrepare(
  tracksOrIds: Array<string | { id?: string }> | null | undefined,
  codec: string,
  { replace = false, urgent = false }: { replace?: boolean; urgent?: boolean } = {},
): void {
  const ids: string[] = [];
  for (const item of tracksOrIds || []) {
    if (typeof item === "string") ids.push(item);
    else if (item?.id) ids.push(item.id);
  }
  let use: string[];
  if (urgent) {
    use = ids;
  } else {
    const fresh = ids.filter((id) => !preparedKeys.has(`${id}|${codec}`));
    if (!fresh.length && !replace) return;
    use = replace ? ids : fresh;
  }
  if (!use.length) return;
  use.forEach((id) => preparedKeys.add(`${id}|${codec}`));
  void apiFetch("/api/transcode/prepare", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ids: use, codec, replace, urgent: !!urgent }),
  }).catch(() => {});
}

export function tracksToPrepare(
  tracks: Array<Track | null | undefined>,
  activeCodec: string,
): Track[] {
  const eligible = (tracks || []).filter(
    (t): t is Track => !!(t?.id && !t.isLossy),
  );
  const policy = settings.playbackPolicy;
  const codecCatalog = settings.options;
  const byTrack = catalogIndex.byTrack;
  return eligible.filter(
    (t) => !willPreferLocal(byTrack[t.id], activeCodec, policy, codecCatalog),
  );
}

export function prepareTracks(
  tracks: Array<Track | null | undefined>,
  opts: PrepareTracksOpts = {},
) {
  const limit = opts.limit ?? 24;
  const list = (tracks || []).filter((t): t is Track => !!t?.id).slice(0, limit);
  if (!list.length) return;

  if (isExclusiveEnabled()) {
    const byTag = new Map<string, Track[]>();
    for (const t of list) {
      const tag = getExclusiveProfileTag(t);
      if (!tag) continue;
      let bucket = byTag.get(tag);
      if (!bucket) {
        bucket = [];
        byTag.set(tag, bucket);
      }
      bucket.push(t);
    }
    for (const [tag, group] of byTag) {
      requestPrepare(group, tag, {
        urgent: !!opts.urgent,
        replace: !!opts.replace,
      });
    }
    return;
  }

  const active = getActiveStreamCodec();
  const need = tracksToPrepare(list, active);
  if (need.length) {
    requestPrepare(need, active, {
      urgent: !!opts.urgent,
      replace: !!opts.replace,
    });
  }
}
