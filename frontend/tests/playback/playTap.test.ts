import { describe, expect, it } from "vitest";
import { playTapAction } from "@/playback/playTap";
import type { PlaySourceState } from "@/playBlock";

function tap(
  overrides: Partial<{
    hasTracks: boolean;
    index: number;
    loadInFlight: boolean;
    playSource: PlaySourceState;
  }> = {},
) {
  return playTapAction({
    hasTracks: true,
    index: 0,
    loadInFlight: false,
    playSource: "streaming",
    ...overrides,
  });
}

describe("playTapAction", () => {
  it("returns noop when the queue is empty", () => {
    expect(tap({ hasTracks: false, index: -1, playSource: "none" })).toBe(
      "noop",
    );
  });

  it("returns flip-want while a load is in flight, including playSource none", () => {
    expect(tap({ loadInFlight: true, playSource: "none" })).toBe("flip-want");
    expect(tap({ loadInFlight: true, playSource: "streaming" })).toBe(
      "flip-want",
    );
  });

  it("returns start-first when no row is selected", () => {
    expect(tap({ index: -1, playSource: "none" })).toBe("start-first");
  });

  it("returns resume for an attached streaming or downloaded source", () => {
    expect(tap({ playSource: "streaming" })).toBe("resume");
    expect(tap({ playSource: "downloaded" })).toBe("resume");
  });

  it("returns reload for unavailable when not in flight", () => {
    expect(tap({ playSource: "unavailable" })).toBe("reload");
  });

  it("returns reload for playSource none when not in flight", () => {
    expect(tap({ playSource: "none" })).toBe("reload");
  });
});
