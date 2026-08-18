import { describe, expect, it } from "vitest";

import {
  PLAYBACK_POSITION_KEY,
  clearPlaybackPosition,
  readPlaybackPosition,
  resumeSeconds,
  writePlaybackPosition,
} from "@/stores/playbackPosition";

describe("playbackPosition storage", () => {
  it("writes and reads a round trip", () => {
    writePlaybackPosition("track-a", 12.5);
    expect(readPlaybackPosition()).toEqual({ trackId: "track-a", seconds: 12.5 });
  });

  it("clears to null", () => {
    writePlaybackPosition("track-a", 12.5);
    clearPlaybackPosition();
    expect(readPlaybackPosition()).toBeNull();
  });

  it("returns null for invalid JSON, missing fields, and negative seconds", () => {
    localStorage.setItem(PLAYBACK_POSITION_KEY, "{");
    expect(readPlaybackPosition()).toBeNull();

    localStorage.setItem(PLAYBACK_POSITION_KEY, JSON.stringify({ seconds: 1 }));
    expect(readPlaybackPosition()).toBeNull();

    localStorage.setItem(
      PLAYBACK_POSITION_KEY,
      JSON.stringify({ trackId: "a", seconds: -1 }),
    );
    expect(readPlaybackPosition()).toBeNull();
  });

  it("does not write empty id or non-finite seconds", () => {
    writePlaybackPosition("", 10);
    writePlaybackPosition("a", Number.NaN);
    writePlaybackPosition("a", -2);
    expect(readPlaybackPosition()).toBeNull();
  });
});

describe("resumeSeconds", () => {
  const saved = { trackId: "a", seconds: 40 };

  it("matches the current track id", () => {
    expect(resumeSeconds({ trackId: "a", saved, duration: 200 })).toBe(40);
  });

  it("returns null on mismatch or missing save", () => {
    expect(resumeSeconds({ trackId: "b", saved, duration: 200 })).toBeNull();
    expect(
      resumeSeconds({ trackId: "a", saved: null, duration: 200 }),
    ).toBeNull();
  });

  it("returns 0 for a pause at the start", () => {
    expect(
      resumeSeconds({
        trackId: "a",
        saved: { trackId: "a", seconds: 0 },
        duration: 200,
      }),
    ).toBe(0);
  });

  it("treats the last 3 seconds (and past the end) as 0", () => {
    expect(
      resumeSeconds({
        trackId: "a",
        saved: { trackId: "a", seconds: 197.1 },
        duration: 200,
      }),
    ).toBe(0);
    expect(
      resumeSeconds({
        trackId: "a",
        saved: { trackId: "a", seconds: 200 },
        duration: 200,
      }),
    ).toBe(0);
    expect(
      resumeSeconds({
        trackId: "a",
        saved: { trackId: "a", seconds: 196.9 },
        duration: 200,
      }),
    ).toBe(196.9);
  });

  it("keeps saved seconds when duration is unknown", () => {
    expect(
      resumeSeconds({ trackId: "a", saved, duration: null }),
    ).toBe(40);
    expect(
      resumeSeconds({ trackId: "a", saved, duration: undefined }),
    ).toBe(40);
  });
});
