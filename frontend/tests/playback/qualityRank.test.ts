import { describe, expect, it } from "vitest";
import { compareQuality, localAtLeastAsGood } from "@/qualityRank";

describe("qualityRank", () => {
  it("ranks FLAC above Opus", () => {
    expect(compareQuality("flac_24_96000", "opus_192_48000")).toBe(1);
    expect(compareQuality("opus_192_48000", "flac_24_96000")).toBe(-1);
  });

  it("treats equal tags as 0", () => {
    expect(compareQuality("flac_16_44100", "flac_16_44100")).toBe(0);
  });

  it("localAtLeastAsGood is true when local FLAC vs stream Opus", () => {
    expect(localAtLeastAsGood("flac_16_44100", "opus_192_48000")).toBe(true);
    expect(localAtLeastAsGood("opus_160_48000", "flac_16_44100")).toBe(false);
  });
});
