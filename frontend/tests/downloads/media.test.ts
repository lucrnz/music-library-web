import { describe, expect, it } from "vitest";
import { codecExt, codecMediaType } from "@/downloads/media";

describe("codecExt / codecMediaType", () => {
  it("uses source media for SOURCE_TAG", () => {
    expect(codecExt("source", "mp3")).toBe("mp3");
    expect(codecMediaType("source", "mp3")).toBe("audio/mpeg");
    expect(codecExt("source", "aac")).toBe("m4a");
    expect(codecMediaType("source", "aac")).toBe("audio/mp4");
  });

  it("maps flac tags to flac and everything else to opus", () => {
    expect(codecExt("flac_16_44100")).toBe("flac");
    expect(codecMediaType("flac_16_44100")).toBe("audio/flac");
    expect(codecExt("opus_192_48000")).toBe("opus");
    expect(codecMediaType("opus_192_48000")).toBe("audio/ogg");
  });
});
