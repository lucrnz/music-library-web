/**
 * Last paused/hidden playback position. Storage only — player.ts applies it.
 */

export const PLAYBACK_POSITION_KEY = "musicweb.playbackPosition.v1";
export const NEAR_END_SECONDS = 3;

export interface PlaybackPosition {
  trackId: string;
  seconds: number;
}

export function readPlaybackPosition(): PlaybackPosition | null {
  try {
    const raw = localStorage.getItem(PLAYBACK_POSITION_KEY);
    if (raw == null) return null;
    const data: unknown = JSON.parse(raw);
    if (!data || typeof data !== "object") return null;
    const rec = data as { trackId?: unknown; seconds?: unknown };
    if (typeof rec.trackId !== "string" || !rec.trackId.length) return null;
    if (typeof rec.seconds !== "number" || !Number.isFinite(rec.seconds) || rec.seconds < 0) {
      return null;
    }
    return { trackId: rec.trackId, seconds: rec.seconds };
  } catch {
    return null;
  }
}

export function writePlaybackPosition(trackId: string, seconds: number) {
  if (!trackId || !Number.isFinite(seconds) || seconds < 0) return;
  try {
    localStorage.setItem(
      PLAYBACK_POSITION_KEY,
      JSON.stringify({ trackId, seconds }),
    );
  } catch {
    /* ignore quota */
  }
}

export function clearPlaybackPosition() {
  try {
    localStorage.removeItem(PLAYBACK_POSITION_KEY);
  } catch {
    /* ignore */
  }
}

export function resumeSeconds(opts: {
  trackId: string | null | undefined;
  saved: PlaybackPosition | null;
  duration: number | null | undefined;
}): number | null {
  const { trackId, saved, duration } = opts;
  if (!saved || !trackId || saved.trackId !== trackId) return null;
  if (
    duration != null &&
    Number.isFinite(duration) &&
    duration > 0 &&
    saved.seconds >= duration - NEAR_END_SECONDS
  ) {
    return 0;
  }
  return saved.seconds;
}
