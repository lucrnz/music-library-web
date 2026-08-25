/**
 * Exclusive-audio settings + companion connection snapshots.
 * Visible only for installed Mac PWA; arming gates playback sink.
 *
 * selectedDeviceId = user preference (persisted).
 * companionDeviceId = live companion hog target (not persisted).
 */
import { reactive } from "vue";
import { apiGet } from "@/api";
import { canShowExclusiveUi } from "@/exclusive/capability";
import {
  pickExclusiveProfileTag,
  type ExclusiveFormat,
  type FormatMode,
} from "@/exclusive/formatPolicy";
import type { ExclusiveFaceSnapshot } from "@/exclusive/statusFace";
import { DEFAULT_PORT, ROLE_CONTROLLER } from "@/exclusive/protocol";
import type { Track } from "@/models/track";

export type { FormatMode };
export type ConnState = "disconnected" | "connecting" | "connected" | "rejected";

export interface ExclusiveDevice {
  id: string;
  name: string;
  sample_rates: number[];
  bit_depths: number[];
}

export interface ExclusiveAudioState {
  capable: boolean;
  enabled: boolean;
  companionToken: string;
  port: number;
  selectedDeviceId: string | null;
  companionDeviceId: string | null;
  formatMode: FormatMode;
  formats: ExclusiveFormat[];
  connection: ConnState;
  role: string | null;
  sessionId: string;
  devices: ExclusiveDevice[];
  lastError: string | null;
  /** Companion app-support path from hello / disk_info. Not persisted. */
  dataDir: string;
}

const KEY_ENABLED = "musicweb.exclusive.enabled";
const KEY_TOKEN = "musicweb.exclusive.companionToken";
const KEY_PORT = "musicweb.exclusive.port";
const KEY_DEVICE = "musicweb.exclusive.deviceId";
const KEY_FORMAT_MODE = "musicweb.exclusive.formatMode";

export const exclusiveAudio = reactive<ExclusiveAudioState>({
  /** Capability: Mac + installed PWA */
  capable: false,
  enabled: false,
  companionToken: "",
  port: DEFAULT_PORT,
  /** User preference (localStorage KEY_DEVICE). */
  selectedDeviceId: null,
  /**
   * Live companion hog target from status selected_device_id.
   * Not persisted.
   */
  companionDeviceId: null,
  formatMode: "prefer_source",
  /** Server exclusive-formats catalog. */
  formats: [],
  connection: "disconnected",
  /** controller | readonly | null */
  role: null,
  sessionId: "",
  devices: [],
  lastError: null,
  dataDir: "",
});

/** Track ids toasted for missing tech this session */
const missingTechToasted = new Set<string>();

function loadPersisted() {
  try {
    exclusiveAudio.enabled = localStorage.getItem(KEY_ENABLED) === "1";
  } catch {
    exclusiveAudio.enabled = false;
  }
  try {
    exclusiveAudio.companionToken = localStorage.getItem(KEY_TOKEN) || "";
  } catch {
    exclusiveAudio.companionToken = "";
  }
  try {
    const raw = localStorage.getItem(KEY_PORT);
    const n = raw != null ? Number(raw) : DEFAULT_PORT;
    exclusiveAudio.port =
      Number.isFinite(n) && n > 0 && n < 65536 ? Math.floor(n) : DEFAULT_PORT;
  } catch {
    exclusiveAudio.port = DEFAULT_PORT;
  }
  try {
    exclusiveAudio.selectedDeviceId = localStorage.getItem(KEY_DEVICE) || null;
  } catch {
    exclusiveAudio.selectedDeviceId = null;
  }
  try {
    const m = localStorage.getItem(KEY_FORMAT_MODE);
    exclusiveAudio.formatMode =
      m === "upsample_device" ? "upsample_device" : "prefer_source";
  } catch {
    exclusiveAudio.formatMode = "prefer_source";
  }
}

function persist() {
  try {
    localStorage.setItem(KEY_ENABLED, exclusiveAudio.enabled ? "1" : "0");
    localStorage.setItem(KEY_TOKEN, exclusiveAudio.companionToken || "");
    localStorage.setItem(KEY_PORT, String(exclusiveAudio.port || DEFAULT_PORT));
    if (exclusiveAudio.selectedDeviceId) {
      localStorage.setItem(KEY_DEVICE, exclusiveAudio.selectedDeviceId);
    } else {
      localStorage.removeItem(KEY_DEVICE);
    }
    localStorage.setItem(KEY_FORMAT_MODE, exclusiveAudio.formatMode);
  } catch {
    /* ignore */
  }
}

/**
 * Exclusive enabled (settings) — hides normal quality controls.
 * Distinct from armed (playable).
 */
export function isExclusiveEnabled() {
  return exclusiveAudio.capable && exclusiveAudio.enabled;
}

/**
 * Armed = can route play through companion (live hub target only).
 */
export function isExclusiveArmed() {
  if (!isExclusiveEnabled()) return false;
  if (exclusiveAudio.connection !== "connected") return false;
  if (exclusiveAudio.role !== ROLE_CONTROLLER) return false;
  const live = exclusiveAudio.companionDeviceId;
  if (!live) return false;
  const list = exclusiveAudio.devices;
  if (list.length > 0 && !list.some((d) => d.id === live)) return false;
  return true;
}

/**
 * Hide the Streaming picker while exclusive is on.
 * Downloads quality and “When a download exists” stay visible.
 */
export function shouldHideStreamQualityControls() {
  return isExclusiveEnabled();
}

/** @deprecated use shouldHideStreamQualityControls */
export function shouldHideBrowserQualityControls() {
  return false;
}

/** Device row used for formatPolicy caps: preference if still listed, else live. */
function deviceForCaps(): ExclusiveDevice | null {
  const list = exclusiveAudio.devices || [];
  const pref = exclusiveAudio.selectedDeviceId;
  if (pref) {
    const hit = list.find((d) => d.id === pref);
    if (hit) return hit;
  }
  const live = exclusiveAudio.companionDeviceId;
  if (live) {
    return list.find((d) => d.id === live) || null;
  }
  return null;
}

/**
 * Snapshot for statusFace / details (reactive-friendly plain object).
 */
export function exclusiveStatusSnapshot(): ExclusiveFaceSnapshot {
  return {
    enabled: isExclusiveEnabled(),
    connection: exclusiveAudio.connection,
    role: exclusiveAudio.role,
    lastError: exclusiveAudio.lastError,
    preferenceId: exclusiveAudio.selectedDeviceId,
    liveId: exclusiveAudio.companionDeviceId,
    devices: exclusiveAudio.devices,
  };
}

export function getExclusiveProfileTag(
  track: Track | null | undefined,
): string | null {
  if (track?.isLossy) return null;
  const device = deviceForCaps();
  const caps = device
    ? {
        sample_rates: device.sample_rates || [],
        bit_depths: device.bit_depths || [],
      }
    : null;
  const source =
    track &&
    (track.sampleRateHz != null || track.bitDepth != null)
      ? {
          sampleRateHz: track.sampleRateHz ?? null,
          bitDepth: track.bitDepth ?? null,
        }
      : null;
  return pickExclusiveProfileTag({
    source,
    deviceCaps: caps,
    mode: exclusiveAudio.formatMode,
    formats: exclusiveAudio.formats,
  });
}

/** @returns true if this is the first toast for this id */
export function consumeMissingTechToast(trackId: string): boolean {
  if (!trackId || missingTechToasted.has(trackId)) return false;
  missingTechToasted.add(trackId);
  return true;
}

export function setExclusiveLive(partial: {
  connection?: ConnState;
  role?: string | null;
  devices?: ExclusiveDevice[];
  companionDeviceId?: string | null;
  lastError?: string | null;
  dataDir?: string | null;
}) {
  if (partial.connection != null) exclusiveAudio.connection = partial.connection;
  if ("role" in partial) exclusiveAudio.role = partial.role ?? null;
  if (partial.devices) exclusiveAudio.devices = partial.devices;
  if ("companionDeviceId" in partial) {
    exclusiveAudio.companionDeviceId = partial.companionDeviceId ?? null;
  }
  if ("lastError" in partial) exclusiveAudio.lastError = partial.lastError ?? null;
  if ("dataDir" in partial) exclusiveAudio.dataDir = partial.dataDir || "";
}

export function setExclusiveEnabled(on: boolean) {
  exclusiveAudio.enabled = !!on;
  persist();
}

export function setCompanionToken(token: string | number | null | undefined) {
  exclusiveAudio.companionToken = String(token || "");
  persist();
}

export function setExclusivePort(port: number | string) {
  const n = Number(port);
  if (!Number.isFinite(n) || n <= 0 || n >= 65536) return;
  exclusiveAudio.port = Math.floor(n);
  persist();
}

export function setFormatMode(mode: string) {
  exclusiveAudio.formatMode =
    mode === "upsample_device" ? "upsample_device" : "prefer_source";
  persist();
}

/**
 * Clear preference + live and persist (device gone / user clear).
 */
export function clearSelectedDevicePreference() {
  exclusiveAudio.selectedDeviceId = null;
  exclusiveAudio.companionDeviceId = null;
  persist();
}

export function setSelectedDeviceId(id: string | null) {
  exclusiveAudio.selectedDeviceId = id || null;
  if (!id) {
    exclusiveAudio.companionDeviceId = null;
  }
  persist();
}

export function setCompanionDeviceId(id: string | null) {
  exclusiveAudio.companionDeviceId = id || null;
}

async function fetchExclusiveFormats() {
  try {
    const data = await apiGet<{ formats?: ExclusiveFormat[] }>(
      "/api/exclusive-formats",
    );
    if (Array.isArray(data?.formats)) {
      exclusiveAudio.formats = data.formats.map((f) => ({
        tag: f.tag,
        sample_rate: f.sample_rate,
        bit_depth: f.bit_depth,
        label: f.label,
      }));
    }
  } catch (err: unknown) {
    console.warn("[exclusive] failed to load exclusive-formats", err);
  }
}

/**
 * Boot: detect capability; if Mac PWA, load prefs + formats.
 * Call once from main.ts.
 */
export async function initExclusiveAudio() {
  exclusiveAudio.capable = canShowExclusiveUi();
  loadPersisted();
  if (!exclusiveAudio.sessionId) {
    try {
      exclusiveAudio.sessionId =
        crypto.randomUUID?.() ||
        `s-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    } catch {
      exclusiveAudio.sessionId = `s-${Date.now()}`;
    }
  }
  if (!exclusiveAudio.capable) {
    return;
  }
  await fetchExclusiveFormats();
}
