import { afterEach, describe, expect, it, vi } from "vitest";

const { canUseCompanionDownloads, readBinary } = vi.hoisted(() => ({
  canUseCompanionDownloads: vi.fn(),
  readBinary: vi.fn(),
}));

vi.mock("@/exclusive/capability", () => ({
  canUseCompanionDownloads,
}));
vi.mock("@/downloads/companionBlob", () => ({
  audioBlobKey: () => "audio/t1.flac.flac",
  fileUrl: () => "http://127.0.0.1:18765/files/audio/t1.flac.flac?token=x",
  deleteKey: vi.fn(),
  albumArtBlobKey: vi.fn(),
  artistArtBlobKey: vi.fn(),
}));
vi.mock("@/downloads/opfs", async () => {
  const actual = await vi.importActual<typeof import("@/downloads/opfs")>(
    "@/downloads/opfs",
  );
  return { ...actual, readBinary };
});
vi.mock("@/downloads/db", () => ({
  getAll: vi.fn(),
  getOne: vi.fn(),
  putOne: vi.fn(),
  reqToPromise: vi.fn(),
  wipeDownloadsDb: vi.fn(),
  withStores: vi.fn(),
}));

import { getLocalAudioUrlForRecord } from "@/downloads/writer";

const rec = {
  trackId: "t1",
  codec: "flac",
  ext: "flac",
  status: "ready",
} as const;

describe("getLocalAudioUrlForRecord leftover fallback", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    readBinary.mockReset();
    canUseCompanionDownloads.mockReset();
  });

  it("returns the companion file URL when HEAD succeeds", async () => {
    canUseCompanionDownloads.mockReturnValue(true);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true }) as Response),
    );
    await expect(getLocalAudioUrlForRecord(rec)).resolves.toContain(
      "127.0.0.1",
    );
    expect(readBinary).not.toHaveBeenCalled();
  });

  it("falls back to leftover OPFS when companion HEAD misses", async () => {
    canUseCompanionDownloads.mockReturnValue(true);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: false }) as Response),
    );
    readBinary.mockResolvedValue(new Blob(["flac"]));
    vi.stubGlobal("URL", {
      ...URL,
      createObjectURL: () => "blob:leftover",
    });
    await expect(getLocalAudioUrlForRecord(rec)).resolves.toBe("blob:leftover");
  });
});
