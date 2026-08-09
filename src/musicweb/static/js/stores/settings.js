/**
 * Streaming codec preference + catalog (decode-filtered).
 */
import { reactive } from "vue";
import { apiGet, requestPrepare, preparedKeys } from "../api.js";
import { filterCodecsByDecodeSupport } from "../codecSupport.js";

const CODEC_STORAGE_KEY = "musicweb.streamCodec";
const DEFAULT_CODEC = "opus_192_48000";

export const settings = reactive({
  stream: DEFAULT_CODEC,
  /**
   * Catalog entries from GET /api/codecs, filtered to formats this browser can decode.
   * @type {{ id: string, label: string, kind?: string, media_type?: string, can_play?: string }[]}
   */
  options: [{ id: DEFAULT_CODEC, label: "Opus 192k 48kHz" }],
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

function loadStreamCodec() {
  const ids = new Set(settings.options.map((o) => o.id));
  try {
    const raw = localStorage.getItem(CODEC_STORAGE_KEY);
    settings.stream = raw != null && ids.has(raw) ? raw : pickDefault();
  } catch {
    settings.stream = pickDefault();
  }
  saveStreamCodec();
}

function saveStreamCodec() {
  try {
    localStorage.setItem(CODEC_STORAGE_KEY, settings.stream);
  } catch {
    /* ignore quota */
  }
}

/**
 * Fetch the codec catalog once at boot, drop formats this browser cannot
 * actually decode, then apply the stored preference.
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
  loadStreamCodec();
}

/**
 * @param {string} v
 * @param {{ tracks: unknown[], index: number, playIndex: (i: number) => void }} ctx
 */
export function setStreamCodec(v, ctx) {
  if (!settings.options.some((o) => o.id === v)) return false;
  if (v === settings.stream) {
    settings.open = false;
    return false;
  }
  settings.stream = v;
  saveStreamCodec();
  settings.open = false;
  preparedKeys.clear();
  requestPrepare(ctx.tracks, v, { replace: true });
  if (ctx.index >= 0) {
    ctx.playIndex(ctx.index);
  }
  return true;
}

export function openSettings() {
  settings.open = true;
  document.body.classList.add("modal-open");
}

export function closeSettings() {
  settings.open = false;
  document.body.classList.remove("modal-open");
}
