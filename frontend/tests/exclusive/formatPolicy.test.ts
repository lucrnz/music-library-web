import { describe, expect, it } from "vitest";
import { pickExclusiveProfileTag } from "@/exclusive/formatPolicy";

const CATALOG = [
  { tag: "flac_16_44100", sample_rate: 44100, bit_depth: 16 },
  { tag: "flac_16_48000", sample_rate: 48000, bit_depth: 16 },
  { tag: "flac_16_88200", sample_rate: 88200, bit_depth: 16 },
  { tag: "flac_16_96000", sample_rate: 96000, bit_depth: 16 },
  { tag: "flac_16_176400", sample_rate: 176400, bit_depth: 16 },
  { tag: "flac_16_192000", sample_rate: 192000, bit_depth: 16 },
  { tag: "flac_24_44100", sample_rate: 44100, bit_depth: 24 },
  { tag: "flac_24_48000", sample_rate: 48000, bit_depth: 24 },
  { tag: "flac_24_88200", sample_rate: 88200, bit_depth: 24 },
  { tag: "flac_24_96000", sample_rate: 96000, bit_depth: 24 },
  { tag: "flac_24_176400", sample_rate: 176400, bit_depth: 24 },
  { tag: "flac_24_192000", sample_rate: 192000, bit_depth: 24 },
];

const ALL_CAPS = {
  sample_rates: [44100, 48000, 88200, 96000, 176400, 192000],
  bit_depths: [16, 24],
};

describe("pickExclusiveProfileTag", () => {
  it("never invents a tag outside the catalog", () => {
    const tag = pickExclusiveProfileTag({
      source: { sampleRateHz: 96000, bitDepth: 24 },
      deviceCaps: ALL_CAPS,
      mode: "prefer_source",
      formats: CATALOG,
    });
    expect(tag).toBe("flac_24_96000");
    expect(CATALOG.some((f) => f.tag === tag)).toBe(true);
  });

  it("returns null for an empty catalog", () => {
    expect(
      pickExclusiveProfileTag({
        source: { sampleRateHz: 44100, bitDepth: 16 },
        deviceCaps: ALL_CAPS,
        mode: "prefer_source",
        formats: [],
      }),
    ).toBeNull();
  });
});
