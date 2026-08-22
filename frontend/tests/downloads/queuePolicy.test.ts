import { beforeEach, describe, expect, it, vi } from "vitest";

const { autoPauseReason } = vi.hoisted(() => ({
  autoPauseReason: vi.fn(),
}));

vi.mock("@/connectivity", () => ({
  autoPauseReason,
  canReachServer: vi.fn(),
  isHardOffline: vi.fn(),
  onConnectivityChange: vi.fn(),
  onConnectivityRecovered: vi.fn(),
  requestHealthProbe: vi.fn(),
  setHealthWork: vi.fn(),
}));
vi.mock("@/downloads/db", () => ({
  getOne: vi.fn(),
  putOne: vi.fn(),
}));
vi.mock("@/downloads/opfs", () => ({
  audioDirParts: vi.fn(),
  audioFileName: vi.fn(),
  partialByteSize: vi.fn(),
}));
vi.mock("@/downloads/queue", () => ({
  emitQueueChange: vi.fn(),
  flushProgressToIdb: vi.fn(),
  freezeWork: vi.fn(),
  listQueue: vi.fn(),
  markPaused: vi.fn(),
  queueHasWork: vi.fn(),
  QueueState: {},
  seedLiveProgress: vi.fn(),
  setQueueMutationSideEffects: vi.fn(),
  unpauseItemsToPending: vi.fn(),
  updateLiveProgress: vi.fn(),
}));
vi.mock("@/downloads/catalog", () => ({
  codecExt: vi.fn(),
}));
vi.mock("@/api", () => ({
  apiGet: vi.fn(),
}));
vi.mock("@/diag/log", () => ({ emit: vi.fn() }));

import { downloadAutoPauseReason } from "@/downloads/queuePolicy";

describe("downloadAutoPauseReason", () => {
  beforeEach(() => {
    autoPauseReason.mockReset();
  });

  it("returns offline / server from autoPauseReason", () => {
    autoPauseReason.mockReturnValue("offline");
    expect(downloadAutoPauseReason()).toBe("offline");
    autoPauseReason.mockReturnValue("server");
    expect(downloadAutoPauseReason()).toBe("server");
  });

  it("returns null when connectivity is clear", () => {
    autoPauseReason.mockReturnValue(null);
    expect(downloadAutoPauseReason()).toBeNull();
  });
});
