import { describe, expect, it } from "vitest";
import {
  INITIAL_VOLUME_ADOPT,
  companionVolumeToFace,
  resolveCompanionStatusVolume,
} from "@/exclusive/companionVolume";

describe("companionVolumeToFace", () => {
  const live = { exclusiveEnabled: true, deviceSelected: true };

  it("maps companion 0–100 onto the 0–1 face when exclusive has a device", () => {
    expect(companionVolumeToFace(40, live)).toBe(0.4);
    expect(companionVolumeToFace(0, live)).toBe(0);
    expect(companionVolumeToFace(100, live)).toBe(1);
  });

  it("clamps out of range values", () => {
    expect(companionVolumeToFace(140, live)).toBe(1);
    expect(companionVolumeToFace(-10, live)).toBe(0);
  });

  it("leaves the face alone when exclusive is off or no device is live", () => {
    expect(
      companionVolumeToFace(40, { exclusiveEnabled: false, deviceSelected: true }),
    ).toBeNull();
    expect(
      companionVolumeToFace(40, { exclusiveEnabled: true, deviceSelected: false }),
    ).toBeNull();
  });

  it("leaves the face alone when volume is missing or not finite", () => {
    expect(companionVolumeToFace(undefined, live)).toBeNull();
    expect(companionVolumeToFace(null, live)).toBeNull();
    expect(companionVolumeToFace("", live)).toBeNull();
    expect(companionVolumeToFace("nope", live)).toBeNull();
    expect(companionVolumeToFace(Number.NaN, live)).toBeNull();
  });
});

describe("resolveCompanionStatusVolume", () => {
  const device = "coreaudio/A";

  function take(
    state: ReturnType<typeof resolveCompanionStatusVolume>["state"],
    volume: unknown,
    extra: { deviceId?: string | null; exclusiveEnabled?: boolean; followAll?: boolean } = {},
  ) {
    return resolveCompanionStatusVolume(state, {
      volume0to100: volume,
      exclusiveEnabled: extra.exclusiveEnabled ?? true,
      deviceId: extra.deviceId === undefined ? device : extra.deviceId,
      followAll: extra.followAll,
    });
  }

  it("adopts the first usable volume for a live device", () => {
    const first = take(INITIAL_VOLUME_ADOPT, 25);
    expect(first.face).toBe(0.25);
    expect(first.state.adopted).toBe(true);
    expect(first.state.deviceId).toBe(device);
  });

  it("ignores later status echoes so 25/80 cannot ping-pong the face", () => {
    const first = take(INITIAL_VOLUME_ADOPT, 25);
    const echo = take(first.state, 80);
    const again = take(echo.state, 25);
    expect(echo.face).toBeNull();
    expect(again.face).toBeNull();
  });

  it("does not mark adopted when volume is missing, then adopts a later known volume", () => {
    const unread = take(INITIAL_VOLUME_ADOPT, null);
    expect(unread.face).toBeNull();
    expect(unread.state.adopted).toBe(false);
    const later = take(unread.state, 40);
    expect(later.face).toBe(0.4);
    expect(later.state.adopted).toBe(true);
  });

  it("re-adopts when the live device changes", () => {
    const onA = take(INITIAL_VOLUME_ADOPT, 25);
    const onB = take(onA.state, 40, { deviceId: "coreaudio/B" });
    expect(onB.face).toBe(0.4);
    expect(onB.state.deviceId).toBe("coreaudio/B");
  });

  it("resets when exclusive is off or the live device is cleared", () => {
    const onA = take(INITIAL_VOLUME_ADOPT, 25);
    const off = take(onA.state, 25, { exclusiveEnabled: false });
    expect(off.face).toBeNull();
    expect(off.state).toEqual(INITIAL_VOLUME_ADOPT);
    const cleared = take(onA.state, 25, { deviceId: null });
    expect(cleared.face).toBeNull();
    expect(cleared.state).toEqual(INITIAL_VOLUME_ADOPT);
  });

  it("followAll applies every status volume (read-only observer)", () => {
    const first = take(INITIAL_VOLUME_ADOPT, 25, { followAll: true });
    const second = take(first.state, 80, { followAll: true });
    expect(first.face).toBe(0.25);
    expect(second.face).toBe(0.8);
  });
});
