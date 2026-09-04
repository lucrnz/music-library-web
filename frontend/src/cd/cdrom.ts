/**
 * Session-only Yellow Book tree + labels. Does not import playlist.
 */
import { reactive } from "vue";
import {
  bindCdromMessages,
  listCdrom,
  type CdromFileLive,
  type CdromIndexLive,
  type CdromListLive,
} from "@/exclusive/opticalClient";
import type { Track } from "@/models/track";
import { exclusiveAudio } from "@/stores/exclusiveAudio";
import { dropLyricsMemory } from "@/lyrics/cache";
import { notifyCdMediaGone } from "@/cd/runtime";
import { cd, refreshCdFace, setCdTracks } from "@/stores/cd";

export const CDROM_ID_PREFIX = "cdrom:";
export const VA_ARTIST_THUMB = "/static/img/va-artist-thumb.webp";

const LOSSY_CODECS = new Set(["mp3", "aac", "wma"]);

export interface CdromDirNode {
  name: string;
  rel: string;
}

export interface CdromFileNode {
  name: string;
  rel: string;
  sourceCodec: string;
  title: string | null;
  artist: string | null;
  album: string | null;
  albumartist: string | null;
  track: number | null;
  disc: number | null;
  year: number | null;
  duration: number | null;
  sampleRateHz: number | null;
  bitDepth: number | null;
  channels: number | null;
  hasCover: boolean;
  hasLocalLyrics: boolean;
}

export interface CdromFolderListing {
  dirs: CdromDirNode[];
  files: CdromFileNode[];
}

export interface CdromTreeState {
  volumeName: string | null;
  autoAddRel: string | null;
  cwd: string;
  walkFileCount: number;
  mounted: boolean;
  folders: Map<string, CdromFolderListing>;
}

export const cdromTree = reactive<CdromTreeState>({
  volumeName: null,
  autoAddRel: null,
  cwd: "",
  walkFileCount: 0,
  mounted: false,
  folders: new Map(),
});

let autoAddArmed = false;
let pendingListRels = new Set<string>();
let lastIndex: CdromIndexLive | null = null;
let lastGeneration: number | null = null;

bindCdromMessages(applyCdromIndex, applyCdromList);

export function isCdromTrack(track: { id?: string } | null | undefined): boolean {
  return !!track?.id && track.id.startsWith(CDROM_ID_PREFIX);
}

export function cdromRelOf(track: Track): string {
  if (track.path) return track.path;
  return track.id.startsWith(CDROM_ID_PREFIX)
    ? track.id.slice(CDROM_ID_PREFIX.length)
    : track.id;
}

export function formatCdromLabel(file: {
  name: string;
  title?: string | null;
  artist?: string | null;
  album?: string | null;
}): string {
  const stem = file.name.includes(".")
    ? file.name.slice(0, file.name.lastIndexOf("."))
    : file.name;
  const title = (file.title || "").trim() || stem;
  const artist = (file.artist || "").trim();
  const album = (file.album || "").trim();
  let out = title;
  if (artist) out += ` - ${artist}`;
  if (album) out += ` [${album}]`;
  return out;
}

export function sortCdromFiles<T extends { name: string; track?: number | null; disc?: number | null }>(
  files: T[],
): T[] {
  const numbered: T[] = [];
  const rest: T[] = [];
  for (const file of files) {
    if (file.track != null && Number.isFinite(file.track)) numbered.push(file);
    else rest.push(file);
  }
  numbered.sort((a, b) => {
    const discA = a.disc == null ? 0 : Number(a.disc);
    const discB = b.disc == null ? 0 : Number(b.disc);
    if (discA !== discB) return discA - discB;
    const trackA = Number(a.track);
    const trackB = Number(b.track);
    if (trackA !== trackB) return trackA - trackB;
    return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
  });
  rest.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
  return numbered.concat(rest);
}

export function isCdromLossy(sourceCodec: string | null | undefined): boolean {
  return LOSSY_CODECS.has((sourceCodec || "").toLowerCase());
}

export function trackFromCdromFile(file: CdromFileNode): Track {
  const title = (file.title || "").trim() || fileStem(file.name);
  const artist = (file.artist || "").trim();
  const album = (file.album || "").trim();
  const duration = file.duration != null && Number.isFinite(file.duration)
    ? Number(file.duration)
    : null;
  return {
    id: CDROM_ID_PREFIX + file.rel,
    path: file.rel,
    title,
    artist,
    album,
    albumId: null,
    artistId: null,
    albumArtist: (file.albumartist || artist).trim(),
    albumArtistId: null,
    track: file.track,
    disc: file.disc,
    year: file.year,
    duration,
    durationMs: duration != null ? Math.round(duration * 1000) : null,
    isMissing: false,
    sampleRateHz: file.sampleRateHz,
    bitDepth: file.bitDepth,
    isLossy: isCdromLossy(file.sourceCodec),
    sourceCodec: file.sourceCodec || null,
    bitrateKbps: null,
    bitrateMode: null,
  };
}

export function cdromCoverUrl(track: Track): string {
  const rel = cdromRelOf(track);
  const file = fileByRel(rel);
  if (!file?.hasCover) return VA_ARTIST_THUMB;
  const deviceId = cd.selectedDriveId;
  const token = exclusiveAudio.companionToken;
  const port = exclusiveAudio.port || 18765;
  if (!deviceId || !token) return VA_ARTIST_THUMB;
  const url = new URL("/cdrom/cover", `http://127.0.0.1:${port}`);
  url.searchParams.set("device", deviceId);
  url.searchParams.set("rel", rel);
  url.searchParams.set("token", token);
  return url.href;
}

export function fileByRel(rel: string): CdromFileNode | null {
  const parent = parentRel(rel);
  const listing = cdromTree.folders.get(parent);
  return listing?.files.find((f) => f.rel === rel) ?? null;
}

export function listingOf(rel: string): CdromFolderListing {
  const raw = cdromTree.folders.get(rel) || { dirs: [], files: [] };
  return {
    dirs: [...raw.dirs].sort((a, b) =>
      a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
    ),
    files: sortCdromFiles(raw.files),
  };
}

export function collectFilesRecursive(rel: string): CdromFileNode[] {
  const out: CdromFileNode[] = [];
  const walk = (folder: string) => {
    const listing = listingOf(folder);
    out.push(...listing.files);
    for (const dir of listing.dirs) walk(dir.rel);
  };
  walk(rel);
  return out;
}

export function clearCdromTree(): void {
  cdromTree.volumeName = lastIndex?.volumeName ?? null;
  cdromTree.autoAddRel = lastIndex?.autoAddRel ?? null;
  cdromTree.cwd = "";
  cdromTree.walkFileCount = lastIndex
    ? lastIndex.folders.reduce((sum, f) => sum + f.fileCount, 0)
    : 0;
  cdromTree.mounted = lastIndex?.volumeName != null;
  cdromTree.folders.clear();
  autoAddArmed = false;
  pendingListRels = new Set();
}

export function forgetCdromIndex(): void {
  lastIndex = null;
  lastGeneration = null;
  clearCdromTree();
  cdromTree.volumeName = null;
  cdromTree.autoAddRel = null;
  cdromTree.walkFileCount = 0;
  cdromTree.mounted = false;
}

export function startCdromSession(): void {
  try {
    if (lastIndex) {
      applyCdromIndex(lastIndex, { force: true });
      return;
    }
    setCdTracks([]);
    // Auto-add waits for cdrom_index (completed walk). A cwd list alone
    // must not enqueue or clear under a leftover autoAddRel.
    autoAddArmed = false;
    listCdrom(cdromTree.cwd || "", cd.selectedDriveId);
    applyCdromFace();
  } catch (err) {
    if (!(err instanceof ReferenceError)) throw err;
  }
}

export function applyCdromIndex(
  index: CdromIndexLive,
  opts?: { force?: boolean },
): void {
  if (cd.mediaKind === "audio") return;
  const sameWalk =
    !opts?.force &&
    index.generation != null &&
    lastGeneration != null &&
    index.generation === lastGeneration &&
    lastIndex != null;
  lastIndex = index;
  lastGeneration = index.generation ?? lastGeneration;
  cdromTree.volumeName = index.volumeName;
  cdromTree.autoAddRel = index.autoAddRel;
  cdromTree.walkFileCount = index.folders.reduce((sum, f) => sum + f.fileCount, 0);
  cdromTree.mounted = index.volumeName != null;
  cd.volumeName = index.volumeName;
  if (sameWalk) {
    const rels = index.folders.length
      ? index.folders.map((f) => f.rel)
      : [""];
    for (const rel of rels) {
      if (!cdromTree.folders.has(rel)) listCdrom(rel, cd.selectedDriveId);
    }
    applyCdromFace();
    return;
  }
  dropLyricsMemory("cdrom:");
  notifyCdMediaGone();
  autoAddArmed = true;
  cdromTree.folders.clear();
  setCdTracks([]);
  const rels = index.folders.length
    ? index.folders.map((f) => f.rel)
    : [""];
  pendingListRels = new Set(rels);
  for (const rel of rels) {
    listCdrom(rel, cd.selectedDriveId);
  }
  applyCdromFace();
}

export function applyCdromList(list: CdromListLive): void {
  const files = list.files.map(liveToNode);
  cdromTree.folders.set(list.rel, {
    dirs: list.dirs.map((d) => ({ name: d.name, rel: d.rel })),
    files,
  });
  pendingListRels.delete(list.rel);
  patchQueueByRel(files);
  maybeAutoAdd();
  applyCdromFace();
}

function maybeAutoAdd(): void {
  if (!autoAddArmed) return;
  if (pendingListRels.size > 0) return;
  autoAddArmed = false;
  const rel = cdromTree.autoAddRel;
  if (rel == null) {
    setCdTracks([]);
    return;
  }
  const files = sortCdromFiles(listingOf(rel).files);
  setCdTracks(files.map(trackFromCdromFile));
}

function patchQueueByRel(files: CdromFileNode[]): void {
  if (!cd.tracks.length) return;
  const byRel = new Map(files.map((f) => [f.rel, f]));
  let changed = false;
  const next = cd.tracks.map((track) => {
    if (!isCdromTrack(track)) return track;
    const rel = cdromRelOf(track);
    const file = byRel.get(rel);
    if (!file) return track;
    changed = true;
    return trackFromCdromFile(file);
  });
  if (changed) {
    const idx = cd.index;
    setCdTracks(next, idx < 0 ? 0 : idx);
  }
}

export function applyCdromFace(): void {
  if (cd.mediaKind !== "data") return;
  if (cdromTree.mounted && cdromTree.walkFileCount === 0 && pendingListRels.size === 0) {
    cd.face = "no_playable";
    return;
  }
  cd.face = "data";
}

function liveToNode(file: CdromFileLive): CdromFileNode {
  return {
    name: file.name,
    rel: file.rel,
    sourceCodec: file.source_codec,
    title: file.title ?? null,
    artist: file.artist ?? null,
    album: file.album ?? null,
    albumartist: file.albumartist ?? null,
    track: file.track ?? null,
    disc: file.disc ?? null,
    year: file.year ?? null,
    duration: file.duration ?? null,
    sampleRateHz: file.sample_rate_hz ?? null,
    bitDepth: file.bit_depth ?? null,
    channels: file.channels ?? null,
    hasCover: !!file.has_cover,
    hasLocalLyrics: !!file.has_local_lyrics,
  };
}

function fileStem(name: string): string {
  const i = name.lastIndexOf(".");
  return i > 0 ? name.slice(0, i) : name;
}

function parentRel(rel: string): string {
  const norm = rel.replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
  if (!norm.includes("/")) return "";
  return norm.slice(0, norm.lastIndexOf("/"));
}
