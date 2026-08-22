import { describe, expect, it, vi } from "vitest";

vi.mock("@/downloads/catalog", () => ({
  isLocallyPlayableDownload: (id: string) => id === "local",
}));

import {
  PLAY_BLOCK_MESSAGES,
  isOfflineUnplayable,
  playBlockMessage,
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
