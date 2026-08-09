/**
 * Real browser decode probes (not canPlayType / UA sniffing).
 *
 * canPlayType is unreliable for MP4-wrapped codecs: Chrome often returns
 * "maybe" for audio/mp4 even when the payload is ALAC and will not play.
 * We instead load a tiny silent fixture of each codec family into a muted
 * HTMLAudioElement and require canplay/loadeddata without error.
 */
import { CODEC_PROBES } from "./codecProbes.js";

/** @type {Map<string, boolean>} */
const cache = new Map();

/**
 * @param {string} mime
 * @param {string} b64
 * @param {number} [timeoutMs]
 * @returns {Promise<boolean>}
 */
function probeDecode(mime, b64, timeoutMs = 2500) {
  let bytes;
  try {
    const bin = atob(b64);
    bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  } catch {
    return Promise.resolve(false);
  }

  const url = URL.createObjectURL(new Blob([bytes], { type: mime }));
  const audio = document.createElement("audio");
  // Never produce audible output even if the browser autoplays or play() is called.
  audio.muted = true;
  audio.defaultMuted = true;
  audio.volume = 0;
  audio.preload = "auto";
  audio.setAttribute("playsinline", "");

  return new Promise((resolve) => {
    let settled = false;
    const finish = (ok) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      audio.removeEventListener("canplay", onOk);
      audio.removeEventListener("loadeddata", onOk);
      audio.removeEventListener("error", onErr);
      try {
        audio.pause();
        audio.removeAttribute("src");
        audio.load();
      } catch {
        /* ignore */
      }
      URL.revokeObjectURL(url);
      resolve(ok);
    };
    const onOk = () => finish(true);
    const onErr = () => finish(false);
    const timer = setTimeout(() => finish(false), timeoutMs);

    audio.addEventListener("canplay", onOk);
    audio.addEventListener("loadeddata", onOk);
    audio.addEventListener("error", onErr);
    audio.src = url;
    try {
      audio.load();
    } catch {
      finish(false);
    }
  });
}

/**
 * Probe one codec family (aac | opus | flac | alac). Results are cached.
 * @param {string} kind
 * @returns {Promise<boolean>}
 */
export async function supportsCodecKind(kind) {
  if (cache.has(kind)) return cache.get(kind);
  const fixture = CODEC_PROBES[kind];
  if (!fixture) {
    // Unknown kind: do not hide the option; server may have added profiles.
    cache.set(kind, true);
    return true;
  }
  const ok = await probeDecode(fixture.mime, fixture.b64);
  cache.set(kind, ok);
  return ok;
}

/**
 * Filter the server codec catalog to formats this browser can actually decode.
 * Probes each unique `kind` once in parallel.
 * @param {{ id: string, kind?: string, can_play?: string, media_type?: string }[]} options
 * @returns {Promise<typeof options>}
 */
export async function filterCodecsByDecodeSupport(options) {
  if (!Array.isArray(options) || !options.length) return options;
  if (typeof Audio === "undefined") return options;

  const kinds = [
    ...new Set(
      options.map((o) => o.kind || kindFromId(o.id)).filter(Boolean)
    ),
  ];
  await Promise.all(kinds.map((k) => supportsCodecKind(k)));

  const supported = options.filter((o) => {
    const kind = o.kind || kindFromId(o.id);
    if (!kind) return true;
    return cache.get(kind) === true;
  });

  // Never empty the catalog if every probe failed (broken Audio / CSP); keep all.
  return supported.length ? supported : options;
}

/** @param {string} id */
function kindFromId(id) {
  if (!id || typeof id !== "string") return null;
  const i = id.indexOf("_");
  return i > 0 ? id.slice(0, i) : id;
}
