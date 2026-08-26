/**
 * Shared pure helpers (no DOM framework coupling).
 */

export function formatTime(sec: number | null | undefined): string {
  if (sec == null || !Number.isFinite(sec) || sec < 0) return "0:00";
  const s = Math.floor(sec % 60);
  const m = Math.floor(sec / 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function formatTrackCount(n: number): string {
  return n === 1 ? "1 track" : `${n} tracks`;
}

export function formatAlbumMeta(opts: {
  artist?: string | null;
  year?: number | null;
  trackCount?: number | null;
  durationSec?: number | null;
}): string {
  const parts: string[] = [];
  if (opts.artist) parts.push(opts.artist);
  if (opts.year) parts.push(String(opts.year));
  if (opts.trackCount != null && Number.isFinite(opts.trackCount)) {
    parts.push(formatTrackCount(opts.trackCount));
  }
  if (
    opts.durationSec != null &&
    Number.isFinite(opts.durationSec) &&
    opts.durationSec >= 0
  ) {
    parts.push(formatTime(opts.durationSec));
  }
  return parts.join(" · ");
}

export function formatPlayingSubtitle(track: {
  artist?: string | null;
  album?: string | null;
  year?: number | null;
}): string {
  const base = [track.artist, track.album].filter(Boolean).join(" - ");
  if (base && track.year) return `${base} (${track.year})`;
  return base;
}

export function formatTrackLabel({
  track,
  title,
  album,
  artist,
}: {
  track?: number | null;
  title?: string | null;
  album?: string | null;
  artist?: string | null;
}): string {
  const body = `${title || ""} - ${album || ""} [${artist || ""}]`;
  if (track == null || !Number.isFinite(Number(track))) return body;
  const n = Math.trunc(Number(track));
  if (n < 0) return body;
  return `${String(n).padStart(2, "0")}. ${body}`;
}

/** Paint the played/selected portion of a range input via --range-fill. */
export function setRangeFill(el: HTMLInputElement | null | undefined): void {
  if (!el) return;
  const min = Number(el.min) || 0;
  const max = Number(el.max) || 100;
  const val = Number(el.value);
  const pct = max === min ? 0 : ((val - min) / (max - min)) * 100;
  el.style.setProperty("--range-fill", `${pct}%`);
}

export const PLACEHOLDER_COVER = "/static/img/placeholder.svg";
