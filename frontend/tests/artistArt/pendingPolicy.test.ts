import { describe, expect, it } from "vitest";
import { applyEnqueue, type PendingRecord } from "@/artistArt/pendingPolicy";

function rec(
  action: PendingRecord["action"],
  extra: Partial<PendingRecord> = {},
): PendingRecord {
  return {
    artistId: "a1",
    action,
    name: "A",
    queuedAt: 1,
    ...extra,
  };
}

describe("applyEnqueue", () => {
  it("upload then upload keeps latest blob", () => {
    const first = rec("upload", { blob: new Blob(["a"]) });
    const next = applyEnqueue(
      first,
      rec("upload", { blob: new Blob(["b"]), queuedAt: 2 }),
      { hasLiveOverride: false },
    );
    expect(next?.action).toBe("upload");
    expect(next?.queuedAt).toBe(2);
  });

  it("never-synced upload then revert clears", () => {
    const next = applyEnqueue(rec("upload"), rec("revert"), {
      hasLiveOverride: false,
    });
    expect(next).toBeNull();
  });

  it("synced override + offline revert queues revert", () => {
    const next = applyEnqueue(undefined, rec("revert"), {
      hasLiveOverride: true,
    });
    expect(next?.action).toBe("revert");
    expect(next?.blob).toBeUndefined();
  });

  it("revert then upload becomes upload", () => {
    const next = applyEnqueue(rec("revert"), rec("upload", { blob: new Blob(["x"]) }), {
      hasLiveOverride: true,
    });
    expect(next?.action).toBe("upload");
  });

  it("synced override + pending upload + revert → one revert, no blob", () => {
    const next = applyEnqueue(rec("upload", { blob: new Blob(["x"]) }), rec("revert"), {
      hasLiveOverride: true,
    });
    expect(next?.action).toBe("revert");
    expect(next?.blob).toBeUndefined();
  });
});
