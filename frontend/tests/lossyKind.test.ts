import { describe, expect, it } from "vitest";
import { deliveryCodec, kindForTrack } from "@/lossyKind";

describe("deliveryCodec", () => {
  it("returns source for lossy tracks", () => {
    expect(deliveryCodec({ isLossy: true }, "flac_16_44100")).toBe("source");
  });

  it("returns the active codec for lossless", () => {
    expect(deliveryCodec({ isLossy: false }, "flac_16_44100")).toBe(
      "flac_16_44100",
    );
  });

  it("kindForTrack returns wma for WMA walk-kind", () => {
    expect(kindForTrack({ isLossy: true, sourceCodec: "wma" })).toBe("wma");
    expect(kindForTrack({ isLossy: false, sourceCodec: "alac" })).toBeNull();
    expect(kindForTrack({ isLossy: false, sourceCodec: "flac" })).toBeNull();
  });
});
