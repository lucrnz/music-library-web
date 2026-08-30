/**
 * Optical companion messages. companionClient registers send; this file
 * maps envelopes onto setCdLive. Does not grow the socket client.
 */
import { canShowCdUi } from "@/exclusive/capability";
import {
  MSG_EJECT_OPTICAL,
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
}

type SendFn = (msg: Record<string, unknown>) => boolean;
type LiveFn = (partial: OpticalLivePatch) => void;
type HelloFn = () => void;

let sendFn: SendFn | null = null;
let applyLive: LiveFn | null = null;
let onHelloExtra: HelloFn | null = null;
let wantsSocket = false;

export function bindOpticalSend(fn: SendFn): void {
  sendFn = fn;
}

export function bindOpticalLive(fn: LiveFn): void {
  applyLive = fn;
}

export function bindOpticalHello(fn: HelloFn): void {
  onHelloExtra = fn;
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
    });
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

export function onCompanionHello(): void {
  if (opticalWantsSocket()) requestListOpticalDrives();
  onHelloExtra?.();
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
