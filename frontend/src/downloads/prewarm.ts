/**
 * Download-queue prepare window + sync/forget against /api/transcode/prepare.
 */
import { canReachServer } from "@/connectivity";
import { SOURCE_TAG } from "@/lossyKind";
import { requestForget, requestPrepare } from "@/playback/prepare";
import { downloads } from "@/downloads/state";
import { pl } from "@/stores/playlist";

export const DOWNLOAD_PREWARM_WINDOW = 8;

export interface DownloadPrewarmRow {
  id?: number;
  trackId: string;
  codec: string;
  state: string;
  addedAt: number;
  snapshot?: { isLossy?: boolean };
}

export interface DownloadPrewarmGroup {
  codec: string;
  ids: string[];
}

const WINDOW_STATES = new Set(["pending", "paused"]);

function isEncodeable(row: DownloadPrewarmRow): boolean {
  if (!row.trackId) return false;
  if (row.snapshot?.isLossy) return false;
  if (row.codec === SOURCE_TAG) return false;
  return WINDOW_STATES.has(row.state);
}

export function selectDownloadPrewarmWindow(
  rows: DownloadPrewarmRow[],
): DownloadPrewarmGroup[] {
  const ranked = [...rows]
    .filter(isEncodeable)
    .sort((a, b) => {
      const byAdded = (a.addedAt || 0) - (b.addedAt || 0);
      if (byAdded !== 0) return byAdded;
      return (a.id ?? 0) - (b.id ?? 0);
    })
    .slice(0, DOWNLOAD_PREWARM_WINDOW);

  const groups: DownloadPrewarmGroup[] = [];
  const indexByCodec = new Map<string, DownloadPrewarmGroup>();
  for (const row of ranked) {
    let group = indexByCodec.get(row.codec);
    if (!group) {
      group = { codec: row.codec, ids: [] };
      indexByCodec.set(row.codec, group);
      groups.push(group);
    }
    group.ids.push(row.trackId);
  }
  return groups;
}

let lastPosted = "";

export function resetDownloadPrewarmState() {
  lastPosted = "";
}

export function syncDownloadPrewarm(rows: DownloadPrewarmRow[]): void {
  if (!downloads.enabled) return;
  if (!canReachServer()) return;
  const groups = selectDownloadPrewarmWindow(rows);
  const snapshot = JSON.stringify(groups);
  if (snapshot === lastPosted) return;
  lastPosted = snapshot;
  for (const group of groups) {
    if (!group.ids.length) continue;
    requestPrepare(group.ids, group.codec, { tier: "download" });
  }
}

export function forgetDownloadPrewarm(ids: string[]): void {
  const retain = new Set(
    pl.tracks.map((t) => t.id).filter((id): id is string => !!id),
  );
  const leaving = [...new Set(ids.filter((id) => !!id && !retain.has(id)))];
  requestForget(leaving);
}
