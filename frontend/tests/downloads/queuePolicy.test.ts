import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { autoPauseReason, isConstrainedConnection } = vi.hoisted(() => ({
  autoPauseReason: vi.fn(),
  isConstrainedConnection: vi.fn(),
}));

vi.mock("@/connectivity", () => ({
  autoPauseReason,
  canReachServer: vi.fn(),
  isHardOffline: vi.fn(),
  onConnectivityChange: vi.fn(),
  onConnectivityRecovered: vi.fn(),
  requestHealthProbe: vi.fn(),
  setHealthContext: vi.fn(),
}));
vi.mock("@/networkConstraints", () => ({
  isConstrainedConnection,
  canDetectConnectionType: vi.fn(() => false),
  onConstraintChange: vi.fn(),
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
  requestPrepare: vi.fn(),
  preparedKeys: () => [],
}));
vi.mock("@/diag/log", () => ({ emit: vi.fn() }));

import { downloadAutoPauseReason } from "@/downloads/queuePolicy";
import { settings } from "@/stores/settings";

describe("downloadAutoPauseReason", () => {
  beforeEach(() => {
    autoPauseReason.mockReset();
    isConstrainedConnection.mockReset();
    settings.onlyDownloadOnWifi = false;
  });

  afterEach(() => {
    settings.onlyDownloadOnWifi = false;
  });

  it("returns offline / server from autoPauseReason", () => {
    autoPauseReason.mockReturnValue("offline");
    expect(downloadAutoPauseReason()).toBe("offline");
    autoPauseReason.mockReturnValue("server");
    expect(downloadAutoPauseReason()).toBe("server");
  });

  it("returns metered when only-wifi and constrained", () => {
    autoPauseReason.mockReturnValue(null);
    settings.onlyDownloadOnWifi = true;
    isConstrainedConnection.mockReturnValue(true);
    expect(downloadAutoPauseReason()).toBe("metered");
  });

  it("returns null when unconstrained", () => {
    autoPauseReason.mockReturnValue(null);
    settings.onlyDownloadOnWifi = true;
    isConstrainedConnection.mockReturnValue(false);
    expect(downloadAutoPauseReason()).toBeNull();
  });
});
