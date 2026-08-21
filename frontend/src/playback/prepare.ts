/**
 * Shared stream prepare for queue add, settings codec change, and near-end.
 */
import { requestPrepare } from "@/api";
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
