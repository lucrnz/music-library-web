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

/** Adopt the first usable status volume per live device; ignore later echoes. */
export type CompanionVolumeAdoptState = {
  deviceId: string | null;
  adopted: boolean;
};

export const INITIAL_VOLUME_ADOPT: CompanionVolumeAdoptState = {
  deviceId: null,
  adopted: false,
};

/**
 * Decide whether this status volume should move the in-app face.
 * Face is set once per live device (pre-hog adopt). Later status echoes
 * must not write the face — that plus sink subscribers is a set_volume loop.
 * `followAll` is for a read-only tab that never sends set_volume.
 */
export function resolveCompanionStatusVolume(
  state: CompanionVolumeAdoptState,
  input: {
    volume0to100: unknown;
    exclusiveEnabled: boolean;
    deviceId: string | null;
    followAll?: boolean;
  },
): { state: CompanionVolumeAdoptState; face: number | null } {
  if (!input.exclusiveEnabled || !input.deviceId) {
    return { state: INITIAL_VOLUME_ADOPT, face: null };
  }
  const adopted = input.deviceId === state.deviceId && state.adopted;
  const mapped = companionVolumeToFace(input.volume0to100, {
    exclusiveEnabled: true,
    deviceSelected: true,
  });
  if (mapped == null) {
    return { state: { deviceId: input.deviceId, adopted }, face: null };
  }
  if (input.followAll || !adopted) {
    return { state: { deviceId: input.deviceId, adopted: true }, face: mapped };
  }
  return { state: { deviceId: input.deviceId, adopted: true }, face: null };
}
