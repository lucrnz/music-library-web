/** Re-seek when heard time drifts more than 2s from the official clock. */

export const RADIO_DRIFT_SECONDS = 2;

export function needsReseek(
  heard: number,
  official: number,
  threshold = RADIO_DRIFT_SECONDS,
): boolean {
  if (!Number.isFinite(heard) || !Number.isFinite(official)) return false;
  return Math.abs(heard - official) > threshold;
}
