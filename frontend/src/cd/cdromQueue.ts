/**
 * CD-local queue verbs. Mutates cd.tracks / cd.index only.
 */
import {
  collectFilesRecursive,
  sortCdromFiles,
  trackFromCdromFile,
  type CdromFileNode,
} from "@/cd/cdrom";
import { cdLoad } from "@/playback/cdLoad";
import { cd, setCdTracks } from "@/stores/cd";
import { player } from "@/stores/playerState";
import type { Track } from "@/models/track";

export function cdromPlayOrQueue(track: Track): void {
  const start = cd.tracks.length === 0 || player.paused;
  appendTracks([track]);
  if (start) void cdLoad(cd.tracks.length - 1);
}

export function cdromAdd(track: Track): void {
  appendTracks([track]);
}

export function cdromAddFolder(rel: string): void {
  const files = collectFilesRecursive(rel);
  appendTracks(files.map(trackFromCdromFile));
}

export function cdromPlayAll(rel: string): void {
  const tracks = collectFilesRecursive(rel).map(trackFromCdromFile);
  setCdTracks(tracks, 0);
  if (tracks.length) void cdLoad(0);
}

export function cdromRemoveAt(index: number): void {
  if (index < 0 || index >= cd.tracks.length) return;
  const next = cd.tracks.slice();
  next.splice(index, 1);
  let cursor = cd.index;
  if (cursor === index) cursor = Math.min(index, next.length - 1);
  else if (cursor > index) cursor -= 1;
  setCdTracks(next, cursor);
}

export function cdromClear(): void {
  setCdTracks([]);
}

export function cdromReorder(from: number, to: number): void {
  if (from === to) return;
  if (from < 0 || to < 0 || from >= cd.tracks.length || to >= cd.tracks.length) {
    return;
  }
  const next = cd.tracks.slice();
  const [row] = next.splice(from, 1);
  next.splice(to, 0, row);
  let cursor = cd.index;
  if (cursor === from) cursor = to;
  else if (from < cursor && to >= cursor) cursor -= 1;
  else if (from > cursor && to <= cursor) cursor += 1;
  setCdTracks(next, cursor);
}

function appendTracks(tracks: Track[]): void {
  if (!tracks.length) return;
  setCdTracks(cd.tracks.concat(tracks), cd.index < 0 ? 0 : cd.index);
}

export function tracksFromFiles(files: CdromFileNode[]): Track[] {
  return sortCdromFiles(files).map(trackFromCdromFile);
}
