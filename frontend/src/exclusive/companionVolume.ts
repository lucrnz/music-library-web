/**
 * Map companion status volume (0–100) onto the 0–1 player face.
 * Null means leave the face alone (exclusive off, no live device, or unusable).
 */
export function companionVolumeToFace(
  volume0to100: unknown,
  opts: { exclusiveEnabled: boolean; deviceSelected: boolean },
): number | null {
  if (!opts.exclusiveEnabled || !opts.deviceSelected) return null;
  if (volume0to100 == null || volume0to100 === "") return null;
  const n = Number(volume0to100);
  if (!Number.isFinite(n)) return null;
  return Math.min(1, Math.max(0, n / 100));
}
