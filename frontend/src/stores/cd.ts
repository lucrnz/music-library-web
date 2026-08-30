/**
 * CD prefs, live optical, cursor, and room face.
 * Identify orchestration lives in cd/identifyFlow.ts.
 */
import { reactive } from "vue";
import { canShowCdUi } from "@/exclusive/capability";
import {
  bindOpticalHello,
  bindOpticalLive,
  setOpticalWantsSocket,
  watchOptical,
} from "@/exclusive/opticalClient";
import type { OpticalMediaKind } from "@/exclusive/opticalClient";
import type { CdMatch } from "@/cd/types";
import { notifyCdEnter, notifyCdMediaGone } from "@/cd/runtime";
import { become, activeSession } from "@/playback/session";
import { exclusiveAudio } from "@/stores/exclusiveAudio";
import type { Track } from "@/models/track";
import { openCdRail, setExpanded, setRailFace } from "@/stores/playerPrefs";
import { player } from "@/stores/playerState";

const KEY_ENABLED = "musicweb.cd.enabled";
const KEY_DRIVE = "musicweb.cd.driveId";
const KEY_DRIVE_KEY = "musicweb.cd.driveKey";

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
  | "pick"
  | "not_audio";

export interface CdDrive {
  id: string;
  name: string;
  key: string;
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
  selectedDriveKey: string | null;
  drives: CdDrive[];
  mediaPresent: boolean;
  mediaKind: OpticalMediaKind;
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
  selectedDriveKey: null,
  drives: [],
  mediaPresent: false,
  mediaKind: "none",
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

function normalizeDrives(drives: CdDrive[]): CdDrive[] {
  return drives.map((d) => ({
    id: d.id,
    name: d.name || d.id,
    key: d.key || d.id,
  }));
}

function rematchSelectedDrive(drives: CdDrive[]): void {
  const lastId = cd.selectedDriveId;
  const lastKey = cd.selectedDriveKey;
  if (lastId && drives.some((d) => d.id === lastId)) {
    const match = drives.find((d) => d.id === lastId);
    if (match && !lastKey) {
      cd.selectedDriveKey = match.key;
      persist();
    }
    return;
  }
  if (lastKey) {
    const keyed = drives.filter((d) => d.key === lastKey);
    if (keyed.length === 1) {
      cd.selectedDriveId = keyed[0].id;
      persist();
    }
  }
}

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
  try {
    if (cd.selectedDriveKey) localStorage.setItem(KEY_DRIVE_KEY, cd.selectedDriveKey);
    else localStorage.removeItem(KEY_DRIVE_KEY);
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
  try {
    cd.selectedDriveKey = localStorage.getItem(KEY_DRIVE_KEY) || null;
  } catch {
    cd.selectedDriveKey = null;
  }
  setOpticalWantsSocket(cd.capable && cd.enabled);
}

function applyOpticalLive(partial: Parameters<typeof setCdLive>[0]): void {
  const prevPresent = cd.mediaPresent;
  const prevKind = cd.mediaKind;
  setCdLive(partial);
  const presentChanged =
    "mediaPresent" in partial && cd.mediaPresent !== prevPresent;
  const kindChanged = "mediaKind" in partial && cd.mediaKind !== prevKind;
  if (!presentChanged && !kindChanged) return;
  if (activeSession() !== "cd") return;
  if (cd.mediaKind === "data") {
    notifyCdMediaGone();
    clearCdCursor();
    cd.pickerOpen = false;
    cd.matches = [];
    cd.face = "not_audio";
    return;
  }
  if (cd.mediaPresent && cd.toc && cd.mediaKind === "audio") {
    void import("@/cd/identifyFlow").then((m) => m.runIdentify());
  } else {
    notifyCdMediaGone();
    clearCdCursor();
    cd.pickerOpen = false;
    cd.matches = [];
    refreshCdFace();
  }
}

function syncCdWatch(): void {
  if (activeSession() !== "cd") return;
  if (cd.enabled && cd.selectedDriveId) {
    watchOptical(true, cd.selectedDriveId);
  } else {
    watchOptical(false);
  }
}

hydrate();
bindOpticalLive(applyOpticalLive);
bindOpticalHello(syncCdWatch);

export function cdEntryAllowed(): boolean {
  return canShowCdUi() && cd.enabled && !!cd.selectedDriveId;
}

export function setCdEnabled(on: boolean): void {
  cd.enabled = !!on;
  persist();
  setOpticalWantsSocket(cd.capable && cd.enabled);
  if (!cd.enabled && activeSession() === "cd") become("none");
  syncCdWatch();
}

export function setCdSelectedDriveId(id: string | null): void {
  cd.selectedDriveId = id || null;
  if (!id) {
    cd.selectedDriveKey = null;
  } else {
    const drive = cd.drives.find((d) => d.id === id);
    cd.selectedDriveKey = drive?.key || id;
  }
  persist();
  if (!cd.selectedDriveId && activeSession() === "cd") become("none");
  syncCdWatch();
}

export function setCdLive(partial: {
  drives?: CdDrive[];
  mediaPresent?: boolean;
  mediaKind?: OpticalMediaKind;
  toc?: CdToc | null;
  cdText?: CdTextInfo | null;
  lastError?: string | null;
}): void {
  if (partial.drives) {
    const prevId = cd.selectedDriveId;
    cd.drives = normalizeDrives(partial.drives);
    rematchSelectedDrive(cd.drives);
    if (cd.selectedDriveId !== prevId) syncCdWatch();
  }
  if ("mediaPresent" in partial) cd.mediaPresent = !!partial.mediaPresent;
  if ("mediaKind" in partial) cd.mediaKind = partial.mediaKind ?? "none";
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
  if (!cdEntryAllowed()) return;
  if (activeSession() === "cd") {
    openCdRail();
    notifyCdEnter();
    if (cd.enabled && cd.selectedDriveId) {
      watchOptical(true, cd.selectedDriveId);
    }
    return;
  }
  become("cd");
  cd.shuffle = false;
  cd.repeat = "off";
  openCdRail();
  notifyCdEnter();
  if (cd.enabled && cd.selectedDriveId) {
    watchOptical(true, cd.selectedDriveId);
  }
  if (cd.mediaPresent && cd.toc && cd.mediaKind === "audio") {
    void import("@/cd/identifyFlow").then((m) => m.runIdentify());
  } else {
    refreshCdFace();
  }
}

export function toggleCdSession(): void {
  if (activeSession() === "cd") {
    become("none");
    return;
  }
  enterCdMode();
}

export function leaveCdMode(): void {
  watchOptical(false);
  clearCdCursor();
  refreshCdFace();
  if (player.railFace === "cd") {
    setRailFace("queue");
    setExpanded(false);
  }
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
  void import("@/cd/identifyFlow").then((m) => m.runIdentify({ force: true }));
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
  if (
    cd.selectedDriveId
    && !cd.drives.some((d) => d.id === cd.selectedDriveId)
  ) {
    cd.face = "drive_missing";
    return;
  }
  if (cd.mediaKind === "data") {
    cd.face = "not_audio";
    return;
  }
  if (!cd.mediaPresent) {
    cd.face = "no_disc";
    return;
  }
  cd.face = "idle";
}
