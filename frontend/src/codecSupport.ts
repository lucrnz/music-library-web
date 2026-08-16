/**
 * Real browser decode probes (not canPlayType / UA sniffing).
 *
 * canPlayType is unreliable for some containers. We instead load a tiny
 * silent fixture of each codec family (opus | flac | mp3 | aac) into a muted
 * HTMLAudioElement and require canplay/loadeddata without error.
 */
import { CODEC_PROBES } from "@/codecProbes";

export type CodecProbeKind = keyof typeof CODEC_PROBES;

export interface CodecOption {
  id: string;
  kind?: string;
  can_play?: string;
  media_type?: string;
}

const cache = new Map<string, boolean>();

function probeDecode(
  mime: string,
  b64: string,
  timeoutMs = 2500,
): Promise<boolean> {
  let bytes: Uint8Array;
  try {
    const bin = atob(b64);
    bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  } catch {
    return Promise.resolve(false);
  }

  const url = URL.createObjectURL(
    new Blob([bytes as BlobPart], { type: mime }),
  );
  const audio = document.createElement("audio");
  // Never produce audible output even if the browser autoplays or play() is called.
  audio.muted = true;
  audio.defaultMuted = true;
  audio.volume = 0;
  audio.preload = "auto";
  audio.setAttribute("playsinline", "");

  return new Promise((resolve) => {
    let settled = false;
    const finish = (ok: boolean) => {
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

function fixtureForKind(
  kind: string,
): (typeof CODEC_PROBES)[CodecProbeKind] | undefined {
  if (kind in CODEC_PROBES) {
    return CODEC_PROBES[kind as CodecProbeKind];
  }
  return undefined;
}

/** Probe one codec family (opus | flac | mp3 | aac). Results are cached. */
export async function supportsCodecKind(kind: string): Promise<boolean> {
  const cached = cache.get(kind);
  if (cached !== undefined) return cached;
  const fixture = fixtureForKind(kind);
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
 */
export async function filterCodecsByDecodeSupport<T extends CodecOption>(
  options: T[],
): Promise<T[]> {
  if (!Array.isArray(options) || !options.length) return options;
  if (typeof Audio === "undefined") return options;

  const kinds = [
    ...new Set(
      options
        .map((o) => o.kind || kindFromId(o.id))
        .filter((k): k is string => !!k),
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

function kindFromId(id: string): string | null {
  if (!id || typeof id !== "string") return null;
  const i = id.indexOf("_");
  return i > 0 ? id.slice(0, i) : id;
}
