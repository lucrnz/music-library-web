import { describe, expect, it } from "vitest";
import { shouldPreferLocalOnline } from "@/downloads/resolve";

const catalog = [{ id: "flac_16_44100" }, { id: "opus_192_48000" }];

describe("shouldPreferLocalOnline", () => {
  it("honors the three playback policies", () => {
    expect(
      shouldPreferLocalOnline(
        "flac_16_44100",
        "opus_192_48000",
        "prefer_offline",
        catalog,
      ),
    ).toBe(true);
    expect(
      shouldPreferLocalOnline(
        "flac_16_44100",
        "opus_192_48000",
        "prefer_stream",
        catalog,
      ),
    ).toBe(false);
    expect(
      shouldPreferLocalOnline(
        "flac_16_44100",
        "opus_192_48000",
        "prefer_better",
        catalog,
      ),
    ).toBe(true);
  });
});
