import { describe, expect, it } from "vitest";

import {
  LISTENS_PENDING_KEY,
  enqueuePending,
  readPendingListens,
  removePending,
} from "@/listens/outbox";

const sample = {
  id: "e1",
  track_id: "t1",
  profile: "source",
  play_source: "streaming" as const,
  counted_at: "2026-08-20T12:00:00.000Z",
};

describe("listen outbox", () => {
  it("writes and reads a pending array", () => {
    expect(enqueuePending(sample)).toBe(true);
    expect(readPendingListens()).toEqual([sample]);
    expect(JSON.parse(localStorage.getItem(LISTENS_PENDING_KEY) || "[]")).toEqual([
      sample,
    ]);
  });

  it("returns [] for missing or invalid JSON", () => {
    expect(readPendingListens()).toEqual([]);
    localStorage.setItem(LISTENS_PENDING_KEY, "{");
    expect(readPendingListens()).toEqual([]);
    localStorage.setItem(LISTENS_PENDING_KEY, JSON.stringify({ id: "x" }));
    expect(readPendingListens()).toEqual([]);
  });

  it("drops the listen when setItem throws", () => {
    const orig = localStorage.setItem.bind(localStorage);
    localStorage.setItem = () => {
      throw new Error("quota");
    };
    expect(enqueuePending(sample)).toBe(false);
    localStorage.setItem = orig;
    expect(readPendingListens()).toEqual([]);
  });

  it("removes by id", () => {
    enqueuePending(sample);
    enqueuePending({ ...sample, id: "e2" });
    removePending("e1");
    expect(readPendingListens().map((item) => item.id)).toEqual(["e2"]);
  });
});
