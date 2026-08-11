/**
 * Quality preferences: Wi‑Fi stream, cellular stream, download codec,
 * playback policy when a download exists, only-download-on-Wi‑Fi.
 */
import { reactive } from "vue";
import { apiGet, requestPrepare, preparedKeys } from "../api.js";
import { filterCodecsByDecodeSupport } from "../codecSupport.js";
import {
  canDetectConnectionType,
  isConstrainedConnection,
  onConstraintChange,
} from "../networkConstraints.js";
import { acquireModalLock, releaseModalLock } from "./modalLock.js";

const KEY_STREAM_WIFI = "musicweb.streamCodec";
const KEY_STREAM_CELLULAR = "musicweb.streamCodecCellular";
const KEY_DOWNLOAD = "musicweb.downloadCodec";
const KEY_PLAYBACK_POLICY = "musicweb.playbackPolicy";
const KEY_ONLY_WIFI = "musicweb.onlyDownloadOnWifi";

const DEFAULT_CODEC = "opus_192_48000";
const DEFAULT_CELLULAR = "opus_160_48000";

/** @typedef {'prefer_better'|'prefer_offline'|'prefer_stream'} PlaybackPolicy */

export const PLAYBACK_POLICIES = [
  {
    id: "prefer_better",
    label: "Prefer higher quality",
    hint: "Use a download when it’s at least as good as streaming quality; otherwise stream.",
  },
  {
    id: "prefer_offline",
    label: "Prefer downloaded file",
    hint: "Always play the on-device file when present.",
  },
  {
    id: "prefer_stream",
    label: "Prefer live stream when online",
    hint: "Stream when online; use downloads only offline.",
  },
];

export const settings = reactive({
  /** Wi‑Fi / unrestricted stream profile tag */
  streamWifi: DEFAULT_CODEC,
  /**
   * Cellular stream profile tag, or null = same as Wi‑Fi.
   * @type {string|null}
   */
  streamCellular: DEFAULT_CELLULAR,
  /** OPFS download profile tag */
  download: DEFAULT_CODEC,
  /** @type {PlaybackPolicy} */
  playbackPolicy: "prefer_better",
  onlyDownloadOnWifi: true,
  /**
   * Catalog entries from GET /api/codecs, filtered to formats this browser can decode.
   * @type {{ id: string, label: string, kind?: string, media_type?: string, can_play?: string, bitrate_kbps?: number, bit_depth?: number, sample_rate?: number }[]}
   */
  options: [{ id: DEFAULT_CODEC, label: "Opus 192k 48kHz", kind: "opus", bitrate_kbps: 192, bit_depth: 16, sample_rate: 48000 }],
  default: DEFAULT_CODEC,
  /** Settings modal open state */
  open: false,
  /** Mirrors canDetectConnectionType for UI reactivity */
  canDetectConnectionType: canDetectConnectionType(),
  /** Mirrors isConstrainedConnection for UI / queue */
  constrained: isConstrainedConnection(),
});

/** @type {string|null} last active stream used for prepare bookkeeping */
let lastPreparedActive = null;

/** @type {null | (() => unknown[])} playlist tracks getter from boot bind */
let getTracksFn = null;

function pickDefault() {
  const ids = new Set(settings.options.map((o) => o.id));
  return (
    (ids.has(settings.default) ? settings.default : null) ||
    settings.options[0]?.id ||
    settings.default
  );
}

function pickDefaultCellular() {
  const ids = new Set(settings.options.map((o) => o.id));
  if (ids.has(DEFAULT_CELLULAR)) return DEFAULT_CELLULAR;
  // Next-lower Opus by bitrate if possible
  const opus = settings.options
    .filter((o) => (o.kind || "").toLowerCase() === "opus")
    .slice()
    .sort((a, b) => (b.bitrate_kbps || 0) - (a.bitrate_kbps || 0));
  if (opus.length >= 2) return opus[1].id;
  if (opus.length === 1) return opus[0].id;
  return null;
}

function loadPrefs() {
  const ids = new Set(settings.options.map((o) => o.id));
  const fallback = pickDefault();

  try {
    const wifiRaw = localStorage.getItem(KEY_STREAM_WIFI);
    settings.streamWifi =
      wifiRaw != null && ids.has(wifiRaw) ? wifiRaw : fallback;
  } catch {
    settings.streamWifi = fallback;
  }

  try {
    const cellRaw = localStorage.getItem(KEY_STREAM_CELLULAR);
    if (cellRaw === "" || cellRaw === "same") {
      settings.streamCellular = null;
    } else if (cellRaw != null && ids.has(cellRaw)) {
      settings.streamCellular = cellRaw;
    } else {
      settings.streamCellular = pickDefaultCellular();
    }
  } catch {
    settings.streamCellular = pickDefaultCellular();
  }

  try {
    const dlRaw = localStorage.getItem(KEY_DOWNLOAD);
    settings.download =
      dlRaw != null && ids.has(dlRaw) ? dlRaw : settings.streamWifi;
  } catch {
    settings.download = settings.streamWifi;
  }

  try {
    const pol = localStorage.getItem(KEY_PLAYBACK_POLICY);
    settings.playbackPolicy =
      pol === "prefer_offline" || pol === "prefer_stream" || pol === "prefer_better"
        ? pol
        : "prefer_better";
  } catch {
    settings.playbackPolicy = "prefer_better";
  }

  try {
    const ow = localStorage.getItem(KEY_ONLY_WIFI);
    // Default true when unset
    settings.onlyDownloadOnWifi = ow == null ? true : ow === "1" || ow === "true";
  } catch {
    settings.onlyDownloadOnWifi = true;
  }

  persistAll();
}

function persistAll() {
  try {
    localStorage.setItem(KEY_STREAM_WIFI, settings.streamWifi);
  } catch {
    /* ignore */
  }
  try {
    localStorage.setItem(
      KEY_STREAM_CELLULAR,
      settings.streamCellular == null ? "same" : settings.streamCellular
    );
  } catch {
    /* ignore */
  }
  try {
    localStorage.setItem(KEY_DOWNLOAD, settings.download);
  } catch {
    /* ignore */
  }
  try {
    localStorage.setItem(KEY_PLAYBACK_POLICY, settings.playbackPolicy);
  } catch {
    /* ignore */
  }
  try {
    localStorage.setItem(
      KEY_ONLY_WIFI,
      settings.onlyDownloadOnWifi ? "true" : "false"
    );
  } catch {
    /* ignore */
  }
}

/**
 * Active stream profile for the current network condition.
 * @returns {string}
 */
export function getActiveStreamCodec() {
  if (!canDetectConnectionType() || !isConstrainedConnection()) {
    return settings.streamWifi;
  }
  if (settings.streamCellular == null || settings.streamCellular === "") {
    return settings.streamWifi;
  }
  return settings.streamCellular;
}

/**
 * Fetch the codec catalog once at boot, drop formats this browser cannot
 * actually decode, then apply stored preferences.
 */
export async function loadCodecs() {
  try {
    const data = await apiGet("/api/codecs");
    if (Array.isArray(data.codecs) && data.codecs.length) {
      settings.options = await filterCodecsByDecodeSupport(data.codecs);
    }
    if (typeof data.default === "string" && data.default) {
      settings.default = data.default;
    }
  } catch (err) {
    console.error("Failed to load codec list", err);
  }
  loadPrefs();
  refreshNetworkFlags();
  lastPreparedActive = getActiveStreamCodec();
}

export function refreshNetworkFlags() {
  settings.canDetectConnectionType = canDetectConnectionType();
  settings.constrained = isConstrainedConnection();
}

/**
 * Single path for lastPreparedActive + preparedKeys + requestPrepare.
 * @param {unknown[]} [tracks]
 * @param {{
 *   force?: boolean,
 *   restartPlayback?: boolean,
 *   playIndex?: (i: number) => void,
 *   index?: number,
 *   notifyDownloads?: boolean,
 * }} [opts]
 */
function applyActiveStreamSideEffects(tracks, opts = {}) {
  const active = getActiveStreamCodec();
  const changed = active !== lastPreparedActive;
  if (changed || opts.force) {
    lastPreparedActive = active;
    preparedKeys.clear();
    const list = tracks || (getTracksFn ? getTracksFn() : []) || [];
    requestPrepare(list, active, { replace: true });
  }
  if (opts.notifyDownloads) {
    import("../downloads/index.js")
      .then((m) => m.onNetworkConstraintChanged?.())
      .catch(() => {});
  }
  if (
    opts.restartPlayback &&
    changed &&
    typeof opts.playIndex === "function" &&
    typeof opts.index === "number" &&
    opts.index >= 0
  ) {
    opts.playIndex(opts.index);
  }
}

/**
 * Background prepare when network constraint flips (no current-track restart).
 * @param {unknown[]} tracks
 */
export function onNetworkConstraintChanged(tracks) {
  refreshNetworkFlags();
  applyActiveStreamSideEffects(tracks, {
    restartPlayback: false,
    notifyDownloads: true,
  });
}

/**
 * @param {string} v
 * @param {{ tracks: unknown[], index: number, playIndex: (i: number) => void }} ctx
 */
export function setStreamWifi(v, ctx) {
  if (!settings.options.some((o) => o.id === v)) return false;
  if (v === settings.streamWifi) {
    settings.open = false;
    return false;
  }
  settings.streamWifi = v;
  persistAll();
  settings.open = false;
  applyActiveStreamSideEffects(ctx.tracks, {
    restartPlayback: true,
    playIndex: ctx.playIndex,
    index: ctx.index,
  });
  return true;
}

/**
 * @param {string|null} v null = same as Wi‑Fi
 * @param {{ tracks: unknown[], index: number, playIndex: (i: number) => void }} ctx
 */
export function setStreamCellular(v, ctx) {
  if (v != null && v !== "" && !settings.options.some((o) => o.id === v)) {
    return false;
  }
  const next = v == null || v === "" ? null : v;
  if (next === settings.streamCellular) {
    settings.open = false;
    return false;
  }
  settings.streamCellular = next;
  persistAll();
  settings.open = false;
  applyActiveStreamSideEffects(ctx.tracks, {
    restartPlayback: true,
    playIndex: ctx.playIndex,
    index: ctx.index,
  });
  return true;
}

/**
 * @param {string} v
 */
export function setDownloadCodec(v) {
  if (!settings.options.some((o) => o.id === v)) return false;
  if (v === settings.download) return false;
  settings.download = v;
  persistAll();
  import("../downloads/index.js")
    .then((m) => m.onDownloadCodecChanged?.())
    .catch(() => {});
  return true;
}

/**
 * Persist playback policy and invalidate prepare bookkeeping so background
 * prepare matches the new policy. Does not restart the current track.
 * @param {PlaybackPolicy} v
 */
export function setPlaybackPolicy(v) {
  if (v !== "prefer_better" && v !== "prefer_offline" && v !== "prefer_stream") {
    return false;
  }
  if (v === settings.playbackPolicy) return false;
  settings.playbackPolicy = v;
  persistAll();
  applyActiveStreamSideEffects(undefined, { force: true, restartPlayback: false });
  return true;
}

/**
 * @param {boolean} on
 */
export function setOnlyDownloadOnWifi(on) {
  const next = !!on;
  if (next === settings.onlyDownloadOnWifi) return false;
  settings.onlyDownloadOnWifi = next;
  persistAll();
  import("../downloads/index.js")
    .then((m) => m.onNetworkConstraintChanged?.())
    .catch(() => {});
  return true;
}

export function openSettings() {
  settings.open = true;
  refreshNetworkFlags();
  acquireModalLock("settings");
}

export function closeSettings() {
  settings.open = false;
  releaseModalLock("settings");
}

/**
 * Subscribe once: keep settings flags fresh; store tracks getter for prepare.
 * @param {() => unknown[]} getTracks
 */
export function bindNetworkConstraintEffects(getTracks) {
  getTracksFn = getTracks;
  onConstraintChange(() => {
    onNetworkConstraintChanged(getTracks() || []);
  });
}
