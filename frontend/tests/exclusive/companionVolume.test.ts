import { describe, expect, it } from "vitest";
import { companionVolumeToFace } from "@/exclusive/companionVolume";

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
