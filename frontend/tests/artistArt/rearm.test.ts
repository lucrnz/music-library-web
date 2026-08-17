import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  isHardOffline: vi.fn(),
  reportFailure: vi.fn(),
  requestHealthProbe: vi.fn(),
  setHealthWork: vi.fn(),
}));

vi.mock("@/connectivity", () => ({
  isHardOffline: mocks.isHardOffline,
  reportFailure: mocks.reportFailure,
  requestHealthProbe: mocks.requestHealthProbe,
  setHealthWork: mocks.setHealthWork,
  canReachServer: vi.fn(),
  classifyError: vi.fn(),
  onConnectivityChange: vi.fn(),
  onConnectivityRecovered: vi.fn(),
}));

vi.mock("@/artistArt/upload", () => ({
  applyPreferredServerResult: vi.fn(),
  deletePreferredArtistImage: vi.fn(),
  postPreferredArtistImage: vi.fn(),
  PreferredRequestError: class extends Error {
    status?: number;
  },
}));

vi.mock("@/stores/ui", () => ({
  showToast: vi.fn(),
}));

import { rearmArtistArtHealth } from "@/artistArt/pending";

describe("rearmArtistArtHealth", () => {
  beforeEach(() => {
    mocks.isHardOffline.mockReset();
    mocks.reportFailure.mockReset();
    mocks.requestHealthProbe.mockReset();
    mocks.setHealthWork.mockReset();
  });

  it("reports failure, sets work, and probes when not hard-offline", () => {
    mocks.isHardOffline.mockReturnValue(false);
    rearmArtistArtHealth();
    expect(mocks.reportFailure).toHaveBeenCalled();
    expect(mocks.setHealthWork).toHaveBeenCalledWith("artist-art", true);
    expect(mocks.requestHealthProbe).toHaveBeenCalledWith(0);
  });

  it("skips when hard-offline", () => {
    mocks.isHardOffline.mockReturnValue(true);
    rearmArtistArtHealth();
    expect(mocks.reportFailure).not.toHaveBeenCalled();
    expect(mocks.requestHealthProbe).not.toHaveBeenCalled();
  });
});
