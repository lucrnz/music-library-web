import { beforeEach, describe, expect, it, vi } from "vitest";

const { addToQueue, playIndex, pl } = vi.hoisted(() => {
  const pl = { length: 2 };
  return {
    pl,
    addToQueue: vi.fn(async () => {
      pl.length += 1;
    }),
    playIndex: vi.fn(),
  };
});

vi.mock("@/stores/playlist", () => ({
  pl,
  addToQueue,
}));

vi.mock("@/stores/player", () => ({
  player: { paused: false },
  playIndex,
}));

import { become, activeSession } from "@/playback/session";
import { playOrQueueTrack } from "@/components/library/rows";

describe("playOrQueueTrack", () => {
  beforeEach(() => {
    addToQueue.mockClear();
    playIndex.mockClear();
    pl.length = 2;
    become("none");
  });

  it("leaves a CD session and plays the tapped row even when the queue is already playing", async () => {
    become("cd");
    await playOrQueueTrack("tapped-row");
    expect(activeSession()).toBe("queue");
    expect(addToQueue).toHaveBeenCalledWith(["tapped-row"]);
    expect(playIndex).toHaveBeenCalledWith(2);
  });
});
