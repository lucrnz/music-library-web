import { describe, expect, it } from "vitest";
import { shouldWarnMissingExclusiveTech } from "@/stores/exclusiveAudio";

describe("shouldWarnMissingExclusiveTech", () => {
  it("is false for lossy", () => {
    expect(
      shouldWarnMissingExclusiveTech({
        isLossy: true,
        sampleRateHz: null,
        bitDepth: null,
      }),
    ).toBe(false);
  });

  it("is true when lossless is missing rate or depth", () => {
    expect(
      shouldWarnMissingExclusiveTech({
        isLossy: false,
        sampleRateHz: null,
        bitDepth: 16,
      }),
    ).toBe(true);
    expect(
      shouldWarnMissingExclusiveTech({
        isLossy: false,
        sampleRateHz: 44100,
        bitDepth: null,
      }),
    ).toBe(true);
  });

  it("is false when lossless has both rate and depth", () => {
    expect(
      shouldWarnMissingExclusiveTech({
        isLossy: false,
        sampleRateHz: 44100,
        bitDepth: 16,
      }),
    ).toBe(false);
  });
});
