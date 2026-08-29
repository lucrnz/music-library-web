/**
 * CD prefs, live optical, cursor, and room face.
 * Identify orchestration lives in cd/identifyFlow.ts.
 */
import { reactive } from "vue";
import { canShowCdUi } from "@/exclusive/capability";
import {
  bindOpticalLive,
  setOpticalWantsSocket,
  watchOptical,
} from "@/exclusive/opticalClient";
import type { CdMatch } from "@/cd/types";
import { notifyCdEnter, notifyCdMediaGone } from "@/cd/runtime";
import { become, activeSession } from "@/playback/session";
import { exclusiveAudio } from "@/stores/exclusiveAudio";
import type { Track } from "@/models/track";
import { openCdRail } from "@/stores/playerPrefs";

const KEY_ENABLED = "musicweb.cd.enabled";
const KEY_DRIVE = "musicweb.cd.driveId";

export type CdRoomFace =
  | "no_disc"
  | "drive_missing"
  | "companion_offline"
  | "needs_setting"
  | "needs_libcdio"
  | "idle"
  | "detecting"
  | "reading"
  | "playing"
  | "pick";

export interface CdDrive {
  id: string;
  name: string;
}

export interface CdToc {
  first_track: number;
  last_audio_track: number;
  leadout_lba: number;
  offsets: number[];
}

export interface CdTextInfo {
  album: string | null;
  artist: string | null;
  tracks: string[];
}

export interface CdState {
  capable: boolean;
  enabled: boolean;
  selectedDriveId: string | null;
  drives: CdDrive[];
  mediaPresent: boolean;
  toc: CdToc | null;
  cdText: CdTextInfo | null;
  lastError: string | null;
  tracks: Track[];
  index: number;
  shuffle: boolean;
  repeat: "off" | "all" | "one";
  face: CdRoomFace;
  matches: CdMatch[];
  lastDiscid: string | null;
  pickerOpen: boolean;
}

export const cd = reactive<CdState>({
  capable: false,
  enabled: false,
  selectedDriveId: null,
  drives: [],
  mediaPresent: false,
  toc: null,
  cdText: null,
  lastError: null,
  tracks: [] as Track[],
  index: -1,
  shuffle: false,
  repeat: "off",
  face: "needs_setting",
  matches: [],
  lastDiscid: null,
  pickerOpen: false,
});

function persist(): void {
  try {
    localStorage.setItem(KEY_ENABLED, cd.enabled ? "1" : "0");
  } catch {
    /* ignore */
  }
  try {
    if (cd.selectedDriveId) localStorage.setItem(KEY_DRIVE, cd.selectedDriveId);
    else localStorage.removeItem(KEY_DRIVE);
  } catch {
    /* ignore */
  }
}

function hydrate(): void {
  cd.capable = canShowCdUi();
  try {
    cd.enabled = localStorage.getItem(KEY_ENABLED) === "1";
  } catch {
    cd.enabled = false;
  }
  try {
    cd.selectedDriveId = localStorage.getItem(KEY_DRIVE) || null;
  } catch {
    cd.selectedDriveId = null;
  }
  setOpticalWantsSocket(cd.capable && cd.enabled);
}

function applyOpticalLive(partial: Parameters<typeof setCdLive>[0]): void {
  const presentChanged = "mediaPresent" in partial;
  setCdLive(partial);
  if (!presentChanged) return;
  if (activeSession() !== "cd") return;
  if (cd.mediaPresent && cd.toc) {
    void import("@/cd/identifyFlow").then((m) => m.runIdentify());
  } else {
    notifyCdMediaGone();
    clearCdCursor();
    cd.pickerOpen = false;
    cd.matches = [];
    refreshCdFace();
  }
}

hydrate();
bindOpticalLive(applyOpticalLive);

export function setCdEnabled(on: boolean): void {
  cd.enabled = !!on;
  persist();
  setOpticalWantsSocket(cd.capable && cd.enabled);
}

export function setCdSelectedDriveId(id: string | null): void {
  cd.selectedDriveId = id || null;
  persist();
}

export function setCdLive(partial: {
  drives?: CdDrive[];
  mediaPresent?: boolean;
  toc?: CdToc | null;
  cdText?: CdTextInfo | null;
  lastError?: string | null;
}): void {
  if (partial.drives) cd.drives = partial.drives;
  if ("mediaPresent" in partial) cd.mediaPresent = !!partial.mediaPresent;
  if ("toc" in partial) cd.toc = partial.toc ?? null;
  if ("cdText" in partial) cd.cdText = partial.cdText ?? null;
  if ("lastError" in partial) cd.lastError = partial.lastError ?? null;
}

export function setCdTracks(tracks: Track[], index = 0): void {
  cd.tracks = tracks;
  cd.index = tracks.length ? Math.max(0, Math.min(index, tracks.length - 1)) : -1;
}

export function clearCdCursor(): void {
  cd.tracks = [];
  cd.index = -1;
  cd.shuffle = false;
  cd.repeat = "off";
}

export function enterCdMode(): void {
  become("cd");
  cd.shuffle = false;
  cd.repeat = "off";
  openCdRail();
  notifyCdEnter();
  if (cd.enabled && cd.selectedDriveId) {
    watchOptical(true, cd.selectedDriveId);
  }
  if (cd.mediaPresent && cd.toc) {
    void import("@/cd/identifyFlow").then((m) => m.runIdentify());
  } else {
    refreshCdFace();
  }
}

export function leaveCdMode(): void {
  watchOptical(false);
  clearCdCursor();
  refreshCdFace();
}

export async function confirmPickerMatch(releaseMbid: string): Promise<void> {
  const { confirmPickerMatch: confirm } = await import("@/cd/identifyFlow");
  await confirm(releaseMbid);
}

export function dismissPicker(): void {
  cd.pickerOpen = false;
  cd.face = "idle";
}

export function reopenPicker(): void {
  if (cd.matches.length) {
    cd.pickerOpen = true;
    cd.face = "pick";
    return;
  }
  void import("@/cd/identifyFlow").then((m) => m.runIdentify());
}

export function refreshCdFace(): void {
  if (!cd.capable) {
    cd.face = "needs_setting";
    return;
  }
  if (!cd.enabled || !cd.selectedDriveId) {
    cd.face = "needs_setting";
    return;
  }
  if (
    exclusiveAudio.connection === "disconnected" ||
    exclusiveAudio.connection === "rejected"
  ) {
    cd.face = "companion_offline";
    return;
  }
  if (cd.lastError && /libcdio/i.test(cd.lastError)) {
    cd.face = "needs_libcdio";
    return;
  }
  if (cd.selectedDriveId && cd.drives.length && !cd.drives.some((d) => d.id === cd.selectedDriveId)) {
    cd.face = "drive_missing";
    return;
  }
  if (!cd.mediaPresent) {
    cd.face = "no_disc";
    return;
  }
  cd.face = "idle";
}
