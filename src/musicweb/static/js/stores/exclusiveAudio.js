/**
 * Exclusive-audio settings + companion connection snapshots.
 * Visible only for installed Mac PWA; arming gates playback sink.
 */
import { reactive } from "vue";
import { apiGet } from "../api.js";
import { canShowExclusiveUi } from "../exclusive/capability.js";
import { pickExclusiveProfileTag } from "../exclusive/formatPolicy.js";
import { DEFAULT_PORT, ROLE_CONTROLLER } from "../exclusive/protocol.js";

const KEY_ENABLED = "musicweb.exclusive.enabled";
const KEY_TOKEN = "musicweb.exclusive.hogToken";
const KEY_PORT = "musicweb.exclusive.port";
const KEY_DEVICE = "musicweb.exclusive.deviceId";
const KEY_FORMAT_MODE = "musicweb.exclusive.formatMode";

/** @typedef {'prefer_source' | 'upsample_device'} FormatMode */
/** @typedef {'disconnected' | 'connecting' | 'connected' | 'rejected'} ConnState */

export const exclusiveAudio = reactive({
  /** Capability: Mac + installed PWA */
  capable: false,
  enabled: false,
  hogToken: "",
  port: DEFAULT_PORT,
  /** @type {string|null} */
  selectedDeviceId: null,
  /** @type {FormatMode} */
  formatMode: "prefer_source",
  /**
   * Server exclusive-formats catalog.
   * @type {{ tag: string, sample_rate: number, bit_depth: number, label?: string }[]}
   */
  formats: [],
  /** @type {ConnState} */
  connection: "disconnected",
  /** @type {string|null} controller | readonly | null */
  role: null,
  sessionId: "",
  /** @type {{ id: string, name: string, sample_rates: number[], bit_depths: number[] }[]} */
  devices: [],
  lastError: null,
  /** Companion status snapshot fields */
  companionPlaying: false,
  companionPaused: true,
});

/** @type {Set<string>} track ids toasted for missing tech this session */
const missingTechToasted = new Set();

function loadPersisted() {
  try {
    exclusiveAudio.enabled = localStorage.getItem(KEY_ENABLED) === "1";
  } catch {
    exclusiveAudio.enabled = false;
  }
  try {
    exclusiveAudio.hogToken = localStorage.getItem(KEY_TOKEN) || "";
  } catch {
    exclusiveAudio.hogToken = "";
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
    localStorage.setItem(KEY_TOKEN, exclusiveAudio.hogToken || "");
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
 * Armed = can route play through companion.
 */
export function isExclusiveArmed() {
  return (
    isExclusiveEnabled() &&
    !!exclusiveAudio.selectedDeviceId &&
    exclusiveAudio.connection === "connected" &&
    exclusiveAudio.role === ROLE_CONTROLLER
  );
}

/**
 * Gate for stream/download/playback-policy UI.
 */
export function shouldHideBrowserQualityControls() {
  return isExclusiveEnabled();
}

/**
 * @param {import('../models/track.js').Track | null | undefined} track
 * @returns {string|null}
 */
export function getExclusiveProfileTag(track) {
  const device = exclusiveAudio.devices.find(
    (d) => d.id === exclusiveAudio.selectedDeviceId
  );
  const caps = device
    ? {
        sample_rates: device.sample_rates || device.sampleRates || [],
        bit_depths: device.bit_depths || device.bitDepths || [],
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

/**
 * @param {string} trackId
 * @returns {boolean} true if this is the first toast for this id
 */
export function consumeMissingTechToast(trackId) {
  if (!trackId || missingTechToasted.has(trackId)) return false;
  missingTechToasted.add(trackId);
  return true;
}

export function setExclusiveEnabled(on) {
  exclusiveAudio.enabled = !!on;
  persist();
  // Companion client reacts via store watchers.
  import("../exclusive/companionClient.js")
    .then((m) => m.syncCompanionConnection())
    .catch(() => {});
}

export function setHogToken(token) {
  exclusiveAudio.hogToken = String(token || "");
  persist();
  import("../exclusive/companionClient.js")
    .then((m) => m.syncCompanionConnection())
    .catch(() => {});
}

export function setExclusivePort(port) {
  const n = Number(port);
  if (!Number.isFinite(n) || n <= 0 || n >= 65536) return;
  exclusiveAudio.port = Math.floor(n);
  persist();
  import("../exclusive/companionClient.js")
    .then((m) => m.syncCompanionConnection())
    .catch(() => {});
}

export function setFormatMode(mode) {
  exclusiveAudio.formatMode =
    mode === "upsample_device" ? "upsample_device" : "prefer_source";
  persist();
}

export function setSelectedDeviceId(id) {
  exclusiveAudio.selectedDeviceId = id || null;
  persist();
  if (id) {
    import("../exclusive/companionClient.js")
      .then((m) => m.requestSetDevice(id))
      .catch(() => {});
  }
}

async function fetchExclusiveFormats() {
  try {
    const data = await apiGet("/api/exclusive-formats");
    if (Array.isArray(data?.formats)) {
      exclusiveAudio.formats = data.formats.map((f) => ({
        tag: f.tag,
        sample_rate: f.sample_rate,
        bit_depth: f.bit_depth,
        label: f.label,
      }));
    }
  } catch (err) {
    console.warn("[exclusive] failed to load exclusive-formats", err);
  }
}

/**
 * Boot: detect capability; if Mac PWA, load prefs + formats.
 * Call once from main.js.
 */
export async function initExclusiveAudio() {
  exclusiveAudio.capable = canShowExclusiveUi();
  loadPersisted();
  // Generate stable session id for controller lock identity
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
  const { syncCompanionConnection } = await import(
    "../exclusive/companionClient.js"
  );
  syncCompanionConnection();
}
