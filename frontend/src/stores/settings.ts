/**
 * Quality preferences: Wi‑Fi stream, cellular stream, download codec,
 * playback policy when a download exists, only-download-on-Wi‑Fi.
 */
import { reactive } from "vue";
import { apiGet, requestPrepare, preparedKeys } from "@/api";
import { reportFailure, reportSuccess } from "@/connectivity";
import { emit } from "@/diag/log";
import {
  filterCodecsByDecodeSupport,
  type CodecOption as ProbeCodecOption,
} from "@/codecSupport";
import type { Track } from "@/models/track";
import {
  canDetectConnectionType,
  isConstrainedConnection,
  onConstraintChange,
} from "@/networkConstraints";
import {
  getExclusiveProfileTag,
  isExclusiveEnabled,
} from "@/stores/exclusiveAudio";
import { acquireModalLock, releaseModalLock } from "@/stores/modalLock";

const KEY_STREAM_WIFI = "musicweb.streamCodec";
const KEY_STREAM_CELLULAR = "musicweb.streamCodecCellular";
const KEY_DOWNLOAD = "musicweb.downloadCodec";
const KEY_PLAYBACK_POLICY = "musicweb.playbackPolicy";
const KEY_ONLY_WIFI = "musicweb.onlyDownloadOnWifi";
const KEY_CATALOG = "musicweb.codecCatalog.v1";

const DEFAULT_CODEC = "opus_192_48000";
const DEFAULT_CELLULAR = "opus_160_48000";

export type PlaybackPolicy = "prefer_better" | "prefer_offline" | "prefer_stream";

export interface CodecOption extends ProbeCodecOption {
  label?: string;
  bitrate_kbps?: number;
  bit_depth?: number;
  sample_rate?: number;
}

export interface CodecCatalog {
  codecs: CodecOption[];
  default?: string;
}

export interface SettingsState {
  streamWifi: string;
  streamCellular: string | null;
  download: string;
  playbackPolicy: PlaybackPolicy;
  onlyDownloadOnWifi: boolean;
  options: CodecOption[];
  default: string;
  open: boolean;
  canDetectConnectionType: boolean;
  constrained: boolean;
}

export interface StreamChangeCtx {
  tracks: Track[];
  index: number;
  playIndex: (i: number) => void;
}

interface ApplyStreamOpts {
  force?: boolean;
  restartPlayback?: boolean;
  playIndex?: (i: number) => void;
  index?: number;
  notifyDownloads?: boolean;
}

export const PLAYBACK_POLICIES = [
  {
    id: "prefer_better" as const,
    label: "Prefer higher quality",
    hint: "Use a download when it’s at least as good as streaming quality; otherwise stream.",
  },
  {
    id: "prefer_offline" as const,
    label: "Prefer downloaded file",
    hint: "Always play the on-device file when present.",
  },
  {
    id: "prefer_stream" as const,
    label: "Prefer live stream when online",
    hint: "Stream when online; use downloads only offline.",
  },
];

export const settings = reactive<SettingsState>({
  /** Wi‑Fi / unrestricted stream profile tag */
  streamWifi: DEFAULT_CODEC,
  /** Cellular stream profile tag, or null = same as Wi‑Fi. */
  streamCellular: DEFAULT_CELLULAR,
  /** OPFS download profile tag */
  download: DEFAULT_CODEC,
  playbackPolicy: "prefer_better",
  onlyDownloadOnWifi: true,
  /**
   * Catalog entries from GET /api/codecs, filtered to formats this browser can decode.
   */
  options: [
    {
      id: DEFAULT_CODEC,
      label: "Opus 192k 48kHz",
      kind: "opus",
      bitrate_kbps: 192,
      bit_depth: 16,
      sample_rate: 48000,
    },
  ],
  default: DEFAULT_CODEC,
  /** Settings modal open state */
  open: false,
  /** Mirrors canDetectConnectionType for UI reactivity */
  canDetectConnectionType: canDetectConnectionType(),
  /** Mirrors isConstrainedConnection for UI / queue */
  constrained: isConstrainedConnection(),
});

/** Last active stream used for prepare bookkeeping */
let lastPreparedActive: string | null = null;

/** Playlist tracks getter from boot bind */
let getTracksFn: (() => Track[]) | null = null;

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

function kindFromTag(id: string) {
  if (!id || typeof id !== "string") return undefined;
  const i = id.indexOf("_");
  return i > 0 ? id.slice(0, i) : id;
}

/**
 * Keep a stored tag visible in pickers when the catalog is the stub.
 */
function ensureSyntheticOption(id: string) {
  if (!id || settings.options.some((o) => o.id === id)) return;
  settings.options.push({ id, label: id, kind: kindFromTag(id) });
}

function isCodecOption(value: unknown): value is CodecOption {
  if (!value || typeof value !== "object") return false;
  const id = (value as { id?: unknown }).id;
  return typeof id === "string" && !!id;
}

function readCachedCatalog(): CodecCatalog | null {
  try {
    const raw = localStorage.getItem(KEY_CATALOG);
    if (!raw) return null;
    const data: unknown = JSON.parse(raw);
    if (!data || typeof data !== "object") return null;
    const rec = data as { codecs?: unknown; default?: unknown };
    if (!Array.isArray(rec.codecs) || !rec.codecs.length) return null;
    if (!rec.codecs.every(isCodecOption)) return null;
    return {
      codecs: rec.codecs.filter(isCodecOption),
      default: typeof rec.default === "string" ? rec.default : undefined,
    };
  } catch {
    return null;
  }
}

function writeCachedCatalog(data: CodecCatalog) {
  try {
    localStorage.setItem(
      KEY_CATALOG,
      JSON.stringify({
        codecs: data.codecs,
        default: data.default,
      })
    );
  } catch {
    /* ignore quota */
  }
}

/**
 * Probe-filter a raw server catalog into settings.options.
 */
async function applyServerCatalog(data: CodecCatalog) {
  const catalog = data.codecs;
  settings.options = await filterCodecsByDecodeSupport(catalog);
  emit(
    "codec.probe.summary",
    {
      catalog: catalog.map((c) => c.id).filter(Boolean),
      kept: settings.options.map((c) => c.id).filter(Boolean),
    },
    "info"
  );
  if (typeof data.default === "string" && data.default) {
    settings.default = data.default;
  }
}

function loadPrefs({ catalogIsAuthoritative }: { catalogIsAuthoritative: boolean }) {
  const ids = new Set(settings.options.map((o) => o.id));
  const fallback = pickDefault();

  try {
    const wifiRaw = localStorage.getItem(KEY_STREAM_WIFI);
    if (wifiRaw != null && ids.has(wifiRaw)) {
      settings.streamWifi = wifiRaw;
    } else if (wifiRaw != null && !catalogIsAuthoritative) {
      settings.streamWifi = wifiRaw;
      ensureSyntheticOption(wifiRaw);
    } else {
      settings.streamWifi = fallback;
    }
  } catch {
    settings.streamWifi = fallback;
  }

  try {
    const cellRaw = localStorage.getItem(KEY_STREAM_CELLULAR);
    if (cellRaw === "" || cellRaw === "same") {
      settings.streamCellular = null;
    } else if (cellRaw != null && ids.has(cellRaw)) {
      settings.streamCellular = cellRaw;
    } else if (cellRaw != null && !catalogIsAuthoritative) {
      settings.streamCellular = cellRaw;
      ensureSyntheticOption(cellRaw);
    } else {
      settings.streamCellular = pickDefaultCellular();
    }
  } catch {
    settings.streamCellular = pickDefaultCellular();
  }

  try {
    const dlRaw = localStorage.getItem(KEY_DOWNLOAD);
    if (dlRaw != null && ids.has(dlRaw)) {
      settings.download = dlRaw;
    } else if (dlRaw != null && !catalogIsAuthoritative) {
      settings.download = dlRaw;
      ensureSyntheticOption(dlRaw);
    } else {
      settings.download = settings.streamWifi;
    }
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

  if (catalogIsAuthoritative) persistAll();
  else persistNonCodecPrefs();
}

function persistNonCodecPrefs() {
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
  persistNonCodecPrefs();
}

/** Active stream profile for the current network condition. */
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
 * Hydrate the codec catalog from localStorage (if any), apply stored
 * preferences, then refresh from GET /api/codecs when the network answers.
 */
export async function loadCodecs() {
  const cached = readCachedCatalog();
  if (cached) {
    await applyServerCatalog(cached);
  }
  loadPrefs({ catalogIsAuthoritative: !!cached });
  refreshNetworkFlags();
  lastPreparedActive = getActiveStreamCodec();

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 4000);
  try {
    const data = await apiGet<CodecCatalog>("/api/codecs", {
      signal: ctrl.signal,
      cache: "no-store",
    });
    reportSuccess();
    if (Array.isArray(data.codecs) && data.codecs.length) {
      writeCachedCatalog({
        codecs: data.codecs,
        default: typeof data.default === "string" ? data.default : undefined,
      });
      await applyServerCatalog(data);
      loadPrefs({ catalogIsAuthoritative: true });
    }
  } catch (err: unknown) {
    console.error("Failed to load codec list", err);
    if (err instanceof Error && err.name === "AbortError") {
      reportFailure(err, 503);
    } else {
      reportFailure(err);
    }
  } finally {
    clearTimeout(timer);
  }
}

export function refreshNetworkFlags() {
  settings.canDetectConnectionType = canDetectConnectionType();
  settings.constrained = isConstrainedConnection();
}

/**
 * Single path for lastPreparedActive + preparedKeys + requestPrepare.
 */
function applyActiveStreamSideEffects(
  tracks?: Track[] | null,
  opts: ApplyStreamOpts = {},
) {
  // Exclusive: prepare by exclusive tags only; skip browser codec prewarm.
  if (isExclusiveEnabled()) {
    lastPreparedActive = null;
    preparedKeys.clear();
    const list = tracks || (getTracksFn ? getTracksFn() : []) || [];
    const byTag = new Map<string, Track[]>();
    for (const t of list) {
      if (!t || typeof t !== "object" || !t.id) {
        continue;
      }
      const tag = getExclusiveProfileTag(t);
      if (!tag) continue;
      let bucket = byTag.get(tag);
      if (!bucket) {
        bucket = [];
        byTag.set(tag, bucket);
      }
      bucket.push(t);
    }
    for (const [tag, group] of byTag) {
      requestPrepare(group, tag, { replace: true });
    }
    if (opts.notifyDownloads) {
      import("../downloads/index.js")
        .then((m) => m.onNetworkConstraintChanged?.())
        .catch(() => {});
    }
    return;
  }

  const active = getActiveStreamCodec();
  const changed = active !== lastPreparedActive;
  if (changed || opts.force) {
    lastPreparedActive = active;
    preparedKeys.clear();
    const raw = tracks || (getTracksFn ? getTracksFn() : []) || [];
    const list = raw.filter((t) => {
      if (!t || typeof t !== "object") return false;
      return !!t.id && !t.isLossy;
    });
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
 */
export function onNetworkConstraintChanged(tracks?: Track[] | null) {
  refreshNetworkFlags();
  applyActiveStreamSideEffects(tracks, {
    restartPlayback: false,
    notifyDownloads: true,
  });
}

export function setStreamWifi(v: string, ctx: StreamChangeCtx) {
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

/** @param v null = same as Wi‑Fi */
export function setStreamCellular(v: string | null, ctx: StreamChangeCtx) {
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

export function setDownloadCodec(v: string) {
  if (!settings.options.some((o) => o.id === v)) return false;
  if (v === settings.download) return false;
  settings.download = v;
  persistAll();
  // trackDownloadState joins reactively on settings.download — no downloads hook.
  return true;
}

/**
 * Persist playback policy and invalidate prepare bookkeeping so background
 * prepare matches the new policy. Does not restart the current track.
 */
export function setPlaybackPolicy(v: PlaybackPolicy) {
  if (v !== "prefer_better" && v !== "prefer_offline" && v !== "prefer_stream") {
    return false;
  }
  if (v === settings.playbackPolicy) return false;
  settings.playbackPolicy = v;
  persistAll();
  applyActiveStreamSideEffects(undefined, { force: true, restartPlayback: false });
  return true;
}

export function setOnlyDownloadOnWifi(on: boolean) {
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
 */
export function bindNetworkConstraintEffects(getTracks: () => Track[]) {
  getTracksFn = getTracks;
  onConstraintChange(() => {
    onNetworkConstraintChanged(getTracks() || []);
  });
}
