/**
 * Quality preferences: stream codec, download codec, playback policy
 * when a download exists.
 */
import { reactive } from "vue";
import { apiGet } from "@/api";
import { reportFailure, reportSuccess } from "@/connectivity";
import { emit } from "@/diag/log";
import {
  filterCodecsByDecodeSupport,
  type CodecOption as ProbeCodecOption,
} from "@/codecSupport";
import { acquireModalLock, releaseModalLock } from "@/stores/modalLock";

const KEY_STREAM = "musicweb.streamCodec";
const KEY_DOWNLOAD = "musicweb.downloadCodec";
const KEY_PLAYBACK_POLICY = "musicweb.playbackPolicy";
const KEY_CATALOG = "musicweb.codecCatalog.v1";

const DEFAULT_CODEC = "opus_192_48000";

export type PlaybackPolicy = "prefer_better" | "prefer_offline" | "prefer_stream";

export interface CodecOption extends ProbeCodecOption {
  label?: string;
  bitrateKbps?: number;
  bitDepth?: number;
  sampleRate?: number;
  approxMbPerHour?: number;
}

export interface CodecCatalog {
  codecs: CodecOption[];
  default?: string;
}

export interface SettingsState {
  streamCodec: string;
  download: string;
  playbackPolicy: PlaybackPolicy;
  options: CodecOption[];
  default: string;
  open: boolean;
}

export const PLAYBACK_POLICIES = [
  {
    id: "prefer_better" as const,
    label: "Prefer higher quality",
    hint: "Use a download when it’s at least as good as streaming quality; otherwise stream. Applies to queue play and radio.",
  },
  {
    id: "prefer_offline" as const,
    label: "Prefer downloaded file",
    hint: "Always play the on-device file when present, including on radio.",
  },
  {
    id: "prefer_stream" as const,
    label: "Prefer live stream when online",
    hint: "Stream when online; use downloads only offline. Applies to queue play and radio.",
  },
];

export const settings = reactive<SettingsState>({
  /** Stream profile tag */
  streamCodec: DEFAULT_CODEC,
  /** OPFS download profile tag */
  download: DEFAULT_CODEC,
  playbackPolicy: "prefer_better",
  /**
   * Catalog entries from GET /api/codecs, filtered to formats this browser can decode.
   */
  options: [
    {
      id: DEFAULT_CODEC,
      label: "Opus 192k 48kHz",
      kind: "opus",
      bitrateKbps: 192,
      bitDepth: 16,
      sampleRate: 48000,
    },
  ],
  default: DEFAULT_CODEC,
  /** Settings modal open state */
  open: false,
});

function pickDefault() {
  const ids = new Set(settings.options.map((o) => o.id));
  return (
    (ids.has(settings.default) ? settings.default : null) ||
    settings.options[0]?.id ||
    settings.default
  );
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

function numField(raw: Record<string, unknown>, camel: string, snake: string): number | undefined {
  const v = raw[camel] ?? raw[snake];
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

function mapCodecOption(value: unknown): CodecOption | null {
  if (!isCodecOption(value)) return null;
  const raw = value as CodecOption & Record<string, unknown>;
  return {
    ...raw,
    id: raw.id,
    bitrateKbps: numField(raw, "bitrateKbps", "bitrate_kbps"),
    bitDepth: numField(raw, "bitDepth", "bit_depth"),
    sampleRate: numField(raw, "sampleRate", "sample_rate"),
    approxMbPerHour: numField(raw, "approxMbPerHour", "approx_mb_per_hour"),
  };
}

/** Settings quality-row copy. Callers omit the hint when ``n`` is missing. */
export function formatApproxMbPerHour(n: number): string {
  return `~${n} MB/h`;
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
      codecs: rec.codecs.map(mapCodecOption).filter((c): c is CodecOption => !!c),
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
  const catalog = data.codecs
    .map(mapCodecOption)
    .filter((c): c is CodecOption => !!c);
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
    const streamRaw = localStorage.getItem(KEY_STREAM);
    if (streamRaw != null && ids.has(streamRaw)) {
      settings.streamCodec = streamRaw;
    } else if (streamRaw != null && !catalogIsAuthoritative) {
      settings.streamCodec = streamRaw;
      ensureSyntheticOption(streamRaw);
    } else {
      settings.streamCodec = fallback;
    }
  } catch {
    settings.streamCodec = fallback;
  }

  try {
    const dlRaw = localStorage.getItem(KEY_DOWNLOAD);
    if (dlRaw != null && ids.has(dlRaw)) {
      settings.download = dlRaw;
    } else if (dlRaw != null && !catalogIsAuthoritative) {
      settings.download = dlRaw;
      ensureSyntheticOption(dlRaw);
    } else {
      settings.download = settings.streamCodec;
    }
  } catch {
    settings.download = settings.streamCodec;
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

  if (catalogIsAuthoritative) persistAll();
  else persistNonCodecPrefs();
}

function persistNonCodecPrefs() {
  try {
    localStorage.setItem(KEY_PLAYBACK_POLICY, settings.playbackPolicy);
  } catch {
    /* ignore */
  }
}

function persistAll() {
  try {
    localStorage.setItem(KEY_STREAM, settings.streamCodec);
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

/** Active stream profile. */
export function getActiveStreamCodec() {
  return settings.streamCodec;
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

export function setStreamCodec(v: string) {
  if (!settings.options.some((o) => o.id === v)) return false;
  if (v === settings.streamCodec) {
    settings.open = false;
    return false;
  }
  settings.streamCodec = v;
  persistAll();
  settings.open = false;
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

/** Persist playback policy. Prepare-on-change lives in player.ts. */
export function setPlaybackPolicy(v: PlaybackPolicy) {
  if (v !== "prefer_better" && v !== "prefer_offline" && v !== "prefer_stream") {
    return false;
  }
  if (v === settings.playbackPolicy) return false;
  settings.playbackPolicy = v;
  persistAll();
  return true;
}

export function openSettings() {
  settings.open = true;
  acquireModalLock("settings");
}

export function closeSettings() {
  settings.open = false;
  releaseModalLock("settings");
}


