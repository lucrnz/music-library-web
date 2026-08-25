import { beforeEach, describe, expect, it, vi } from "vitest";

const { autoPauseReason, canUseCompanionDownloads } = vi.hoisted(() => ({
  autoPauseReason: vi.fn(),
  canUseCompanionDownloads: vi.fn(),
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
vi.mock("@/exclusive/capability", () => ({
  canUseCompanionDownloads,
}));
vi.mock("@/exclusive/companionClient", () => ({
  onCompanionEvent: vi.fn(),
}));
vi.mock("@/downloads/companionBlob", () => ({
  audioBlobKey: vi.fn(() => "audio/t1.flac.flac"),
  stat: vi.fn(),
}));
vi.mock("@/stores/exclusiveAudio", () => ({
  exclusiveAudio: { connection: "disconnected" },
}));

import { downloadAutoPauseReason, setDownloadsEnabled } from "@/downloads/queuePolicy";
import { exclusiveAudio } from "@/stores/exclusiveAudio";

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

  it("returns null when connectivity is clear", async () => {
    autoPauseReason.mockReturnValue(null);
    canUseCompanionDownloads.mockReturnValue(false);
    await setDownloadsEnabled(false);
    expect(downloadAutoPauseReason()).toBeNull();
  });

  it("returns companion when capable, enabled, and disconnected", async () => {
    autoPauseReason.mockReturnValue(null);
    canUseCompanionDownloads.mockReturnValue(true);
    await setDownloadsEnabled(true);
    exclusiveAudio.connection = "disconnected";
    expect(downloadAutoPauseReason()).toBe("companion");
    exclusiveAudio.connection = "connected";
    expect(downloadAutoPauseReason()).toBeNull();
  });
});
