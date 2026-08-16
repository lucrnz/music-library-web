/**
 * Shared pure helpers (no DOM framework coupling).
 */

export function formatTime(sec: number | null | undefined): string {
  if (sec == null || !Number.isFinite(sec) || sec < 0) return "0:00";
  const s = Math.floor(sec % 60);
  const m = Math.floor(sec / 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
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
