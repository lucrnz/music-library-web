/**
 * Optical companion messages. companionClient registers send; this file
 * maps envelopes onto setCdLive. Does not grow the socket client.
 */
import { canShowCdUi } from "@/exclusive/capability";
import {
  MSG_CDROM_INDEX,
  MSG_CDROM_LIST,
  MSG_EJECT_OPTICAL,
  MSG_LIST_CDROM,
  MSG_LIST_OPTICAL_DRIVES,
  MSG_OPTICAL_DRIVES,
  MSG_OPTICAL_ERROR,
  MSG_OPTICAL_MEDIA,
  MSG_WATCH_OPTICAL,
  envelope,
} from "@/exclusive/protocol";

export interface OpticalDriveLive {
  id: string;
  name: string;
  key: string;
}

export interface OpticalTocLive {
  first_track: number;
  last_audio_track: number;
  leadout_lba: number;
  offsets: number[];
}

export interface OpticalCdTextLive {
  album: string | null;
  artist: string | null;
  tracks: string[];
}

export type OpticalMediaKind = "audio" | "none" | "data";

export interface OpticalLivePatch {
  drives?: OpticalDriveLive[];
  mediaPresent?: boolean;
  mediaKind?: OpticalMediaKind;
  toc?: OpticalTocLive | null;
  cdText?: OpticalCdTextLive | null;
  lastError?: string | null;
  volumeName?: string | null;
}

export interface CdromFileLive {
  name: string;
  rel: string;
  source_codec: string;
  title?: string | null;
  artist?: string | null;
  album?: string | null;
  albumartist?: string | null;
  track?: number | null;
  disc?: number | null;
  year?: number | null;
  duration?: number | null;
  sample_rate_hz?: number | null;
  bit_depth?: number | null;
  channels?: number | null;
  has_cover?: boolean;
  has_local_lyrics?: boolean;
}

export interface CdromIndexLive {
  volumeName: string | null;
  autoAddRel: string | null;
  folders: Array<{ rel: string; fileCount: number }>;
  generation?: number | null;
}

export interface CdromListLive {
  rel: string;
  dirs: Array<{ name: string; rel: string }>;
  files: CdromFileLive[];
}

type CdromIndexFn = (index: CdromIndexLive) => void;
type CdromListFn = (list: CdromListLive) => void;

type SendFn = (msg: Record<string, unknown>) => boolean;
type LiveFn = (partial: OpticalLivePatch) => void;
type HelloFn = () => void;

let sendFn: SendFn | null = null;
let applyLive: LiveFn | null = null;
let onHelloExtra: HelloFn | null = null;
let wantsSocket = false;
let onCdromIndex: CdromIndexFn | null = null;
let onCdromList: CdromListFn | null = null;
let pendingCdromIndex: CdromIndexLive | null = null;
const pendingCdromLists: CdromListLive[] = [];

export function bindOpticalSend(fn: SendFn): void {
  sendFn = fn;
}

export function bindOpticalLive(fn: LiveFn): void {
  applyLive = fn;
}

export function bindOpticalHello(fn: HelloFn): void {
  onHelloExtra = fn;
}

export function bindCdromMessages(indexFn: CdromIndexFn, listFn: CdromListFn): void {
  onCdromIndex = indexFn;
  onCdromList = listFn;
  if (pendingCdromIndex) {
    indexFn(pendingCdromIndex);
    pendingCdromIndex = null;
  }
  if (pendingCdromLists.length) {
    const queued = pendingCdromLists.splice(0, pendingCdromLists.length);
    for (const item of queued) listFn(item);
  }
}

export function setOpticalWantsSocket(on: boolean): void {
  wantsSocket = !!on;
}

export function opticalWantsSocket(): boolean {
  return canShowCdUi() && wantsSocket;
}

export function handleOpticalMessage(msg: {
  type?: string;
  drives?: unknown;
  device_id?: unknown;
  present?: unknown;
  kind?: unknown;
  toc?: unknown;
  cd_text?: unknown;
  volume_name?: unknown;
  auto_add_rel?: unknown;
  folders?: unknown;
  generation?: unknown;
  rel?: unknown;
  dirs?: unknown;
  files?: unknown;
  message?: string;
  code?: string;
}): boolean {
  const type = msg.type;
  if (type === MSG_OPTICAL_DRIVES) {
    const list = Array.isArray(msg.drives) ? msg.drives : [];
    const drives: OpticalDriveLive[] = list.map((raw) => {
      const rec = raw as { id?: string; name?: string; key?: string };
      const id = String(rec.id || "");
      return { id, name: rec.name || id, key: String(rec.key || id) };
    }).filter((d) => d.id);
    applyLive?.({ drives, lastError: null });
    return true;
  }
  if (type === MSG_OPTICAL_MEDIA) {
    const toc = parseToc(msg.toc);
    const cdText = parseCdText(msg.cd_text);
    const present = !!msg.present;
    applyLive?.({
      mediaPresent: present,
      mediaKind: parseKind(msg.kind, present, toc),
      toc,
      cdText,
      volumeName: parseVolumeName(msg.volume_name),
    });
    return true;
  }
  if (type === MSG_CDROM_INDEX) {
    const index = parseCdromIndex(msg);
    if (onCdromIndex) onCdromIndex(index);
    else pendingCdromIndex = index;
    return true;
  }
  if (type === MSG_CDROM_LIST) {
    const list = parseCdromList(msg);
    if (onCdromList) onCdromList(list);
    else pendingCdromLists.push(list);
    return true;
  }
  if (type === MSG_OPTICAL_ERROR) {
    applyLive?.({ lastError: msg.message || msg.code || "optical error" });
    return true;
  }
  return false;
}

export function requestListOpticalDrives(): boolean {
  return sendFn?.(envelope(MSG_LIST_OPTICAL_DRIVES)) ?? false;
}

export function watchOptical(on: boolean, deviceId?: string | null): boolean {
  return (
    sendFn?.(
      envelope(MSG_WATCH_OPTICAL, {
        on: !!on,
        deviceId: deviceId || undefined,
      }),
    ) ?? false
  );
}

export function ejectOptical(deviceId: string): boolean {
  return sendFn?.(envelope(MSG_EJECT_OPTICAL, { deviceId })) ?? false;
}

export function listCdrom(rel: string, deviceId?: string | null): boolean {
  return (
    sendFn?.(
      envelope(MSG_LIST_CDROM, {
        deviceId: deviceId || undefined,
        rel: rel || "",
      }),
    ) ?? false
  );
}

export function onCompanionHello(): void {
  if (opticalWantsSocket()) requestListOpticalDrives();
  onHelloExtra?.();
}

function parseVolumeName(raw: unknown): string | null {
  if (raw == null || raw === "") return null;
  return String(raw);
}

function parseCdromIndex(msg: {
  volume_name?: unknown;
  auto_add_rel?: unknown;
  folders?: unknown;
  generation?: unknown;
}): CdromIndexLive {
  const foldersRaw = Array.isArray(msg.folders) ? msg.folders : [];
  const folders: Array<{ rel: string; fileCount: number }> = [];
  for (const raw of foldersRaw) {
    if (!raw || typeof raw !== "object") continue;
    const rec = raw as { rel?: unknown; file_count?: unknown };
    folders.push({
      rel: rec.rel == null ? "" : String(rec.rel),
      fileCount: Number(rec.file_count) || 0,
    });
  }
  const gen = Number(msg.generation);
  return {
    volumeName: parseVolumeName(msg.volume_name),
    autoAddRel: msg.auto_add_rel == null ? null : String(msg.auto_add_rel),
    folders,
    generation: Number.isFinite(gen) && gen > 0 ? gen : null,
  };
}

function parseCdromList(msg: {
  rel?: unknown;
  dirs?: unknown;
  files?: unknown;
}): CdromListLive {
  const dirsRaw = Array.isArray(msg.dirs) ? msg.dirs : [];
  const filesRaw = Array.isArray(msg.files) ? msg.files : [];
  return {
    rel: msg.rel == null ? "" : String(msg.rel),
    dirs: dirsRaw
      .map((raw) => {
        const rec = raw as { name?: unknown; rel?: unknown };
        return {
          name: String(rec.name || ""),
          rel: String(rec.rel || ""),
        };
      })
      .filter((d) => d.rel || d.name),
    files: filesRaw.map(parseCdromFile).filter((f) => f.rel),
  };
}

function parseCdromFile(raw: unknown): CdromFileLive {
  const rec = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  return {
    name: String(rec.name || ""),
    rel: String(rec.rel || ""),
    source_codec: String(rec.source_codec || ""),
    title: rec.title == null ? null : String(rec.title),
    artist: rec.artist == null ? null : String(rec.artist),
    album: rec.album == null ? null : String(rec.album),
    albumartist: rec.albumartist == null ? null : String(rec.albumartist),
    track: rec.track == null ? null : Number(rec.track),
    disc: rec.disc == null ? null : Number(rec.disc),
    year: rec.year == null ? null : Number(rec.year),
    duration: rec.duration == null ? null : Number(rec.duration),
    sample_rate_hz: rec.sample_rate_hz == null ? null : Number(rec.sample_rate_hz),
    bit_depth: rec.bit_depth == null ? null : Number(rec.bit_depth),
    channels: rec.channels == null ? null : Number(rec.channels),
    has_cover: !!rec.has_cover,
    has_local_lyrics: !!rec.has_local_lyrics,
  };
}

function parseKind(
  raw: unknown,
  present: boolean,
  toc: OpticalTocLive | null,
): OpticalMediaKind {
  if (raw === "audio" || raw === "none" || raw === "data") return raw;
  if (present && toc) return "audio";
  if (present) return "data";
  return "none";
}

function parseToc(raw: unknown): OpticalTocLive | null {
  if (!raw || typeof raw !== "object") return null;
  const rec = raw as {
    first_track?: unknown;
    last_audio_track?: unknown;
    leadout_lba?: unknown;
    offsets?: unknown;
  };
  if (!Array.isArray(rec.offsets)) return null;
  return {
    first_track: Number(rec.first_track),
    last_audio_track: Number(rec.last_audio_track),
    leadout_lba: Number(rec.leadout_lba),
    offsets: rec.offsets.map((n) => Number(n)),
  };
}

function parseCdText(raw: unknown): OpticalCdTextLive | null {
  if (!raw || typeof raw !== "object") return null;
  const rec = raw as { album?: unknown; artist?: unknown; tracks?: unknown };
  return {
    album: rec.album == null ? null : String(rec.album),
    artist: rec.artist == null ? null : String(rec.artist),
    tracks: Array.isArray(rec.tracks) ? rec.tracks.map((t) => String(t)) : [],
  };
}
