import { describe, expect, it, vi } from "vitest";

vi.mock("@/downloads/catalog", () => ({
  isLocallyPlayableDownload: (id: string) => id === "local",
}));

import {
  PLAY_BLOCK_MESSAGES,
  PlayBlockError,
  isOfflineUnplayable,
  playBlockMessage,
  toPlayBlockError,
  type PlayBlockReason,
} from "@/playBlock";

describe("playBlockMessage", () => {
  it("returns copy for every PlayBlockReason", () => {
    for (const reason of Object.keys(PLAY_BLOCK_MESSAGES) as PlayBlockReason[]) {
      expect(playBlockMessage(reason)).toBe(PLAY_BLOCK_MESSAGES[reason]);
    }
  });

  it("returns null for unknown, empty, and missing reasons", () => {
    expect(playBlockMessage("not-a-reason")).toBeNull();
    expect(playBlockMessage("")).toBeNull();
    expect(playBlockMessage(null)).toBeNull();
    expect(playBlockMessage(undefined)).toBeNull();
  });
});

describe("PlayBlockError", () => {
  it("defaults the message from PLAY_BLOCK_MESSAGES", () => {
    const err = new PlayBlockError("exclusive_failed");
    expect(err.reason).toBe("exclusive_failed");
    expect(err.message).toBe(PLAY_BLOCK_MESSAGES.exclusive_failed);
    expect(err.name).toBe("PlayBlockError");
  });

  it("keeps an explicit message", () => {
    const err = new PlayBlockError("play_failed", "boom");
    expect(err.message).toBe("boom");
  });
});

describe("toPlayBlockError", () => {
  it("returns the same PlayBlockError", () => {
    const err = new PlayBlockError("exclusive_needs_device");
    expect(toPlayBlockError(err, "play_failed")).toBe(err);
  });

  it("wraps a plain Error with the fallback reason", () => {
    const wrapped = toPlayBlockError(new Error("nope"), "play_failed");
    expect(wrapped).toBeInstanceOf(PlayBlockError);
    expect(wrapped.reason).toBe("play_failed");
    expect(wrapped.message).toBe("nope");
  });
});

describe("isOfflineUnplayable", () => {
  const offline = { downloadsEnabled: true, canUseRemote: false };

  it("is true when downloads are on, remote is unusable, and the file is not local", () => {
    expect(isOfflineUnplayable("remote", offline)).toBe(true);
    expect(isOfflineUnplayable(undefined, offline)).toBe(true);
  });

  it("is false when a local download is playable", () => {
    expect(isOfflineUnplayable("local", offline)).toBe(false);
  });

  it("is false when downloads are off or remote media is usable", () => {
    expect(
      isOfflineUnplayable("remote", {
        downloadsEnabled: false,
        canUseRemote: false,
      }),
    ).toBe(false);
    expect(
      isOfflineUnplayable("remote", {
        downloadsEnabled: true,
        canUseRemote: true,
      }),
    ).toBe(false);
  });
});
