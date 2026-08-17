import { describe, expect, it } from "vitest";
import {
  PLAY_BLOCK_MESSAGES,
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
