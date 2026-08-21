import { describe, expect, it } from "vitest";
import type { PlayIntent } from "@/playback/playIntent";
import { needsCompanionStop } from "@/playback/playIntent";

const unavailable: PlayIntent = {
  source: "unavailable",
  profile: null,
  block: "exclusive_lossy",
  message: "nope",
};

const companion: PlayIntent = {
  source: "streaming",
  sink: "companion",
  profile: "flac_24_48000",
  url: "https://example.test/a",
};

const html: PlayIntent = {
  source: "streaming",
  sink: "htmlAudio",
  profile: "opus_192_48000",
  url: "/api/stream?id=1",
};

describe("needsCompanionStop", () => {
  it("stops companion when the intent is unavailable", () => {
    expect(needsCompanionStop(unavailable, "companion")).toBe(true);
    expect(needsCompanionStop(unavailable, "htmlAudio")).toBe(true);
  });

  it("stops companion when switching companion → html", () => {
    expect(needsCompanionStop(html, "companion")).toBe(true);
  });

  it("does not stop companion on exclusive track-to-track", () => {
    expect(needsCompanionStop(companion, "companion")).toBe(false);
  });

  it("stops companion when switching html → companion", () => {
    expect(needsCompanionStop(companion, "htmlAudio")).toBe(true);
  });
});
