import { describe, expect, it } from "vitest";
import {
  formatBytes,
  formatDownloadsStorageLine,
} from "@/downloads/storageInfo";
import { artFileSpecsFromRecords } from "@/downloads/writer";
import {
  albumCoverDirParts,
  albumCoverFileName,
  artistCoverDirParts,
  artistCoverFileName,
} from "@/downloads/opfs";

describe("formatDownloadsStorageLine", () => {
  it("empty catalog uses the existing empty copy", () => {
    expect(formatDownloadsStorageLine({ trackCount: 0 }, "long")).toBe(
      "No downloads yet",
    );
    expect(formatDownloadsStorageLine({ trackCount: 0 }, "short")).toBe(
      "Ready - no downloads yet",
    );
  });

  it("prints N tracks · catalog used", () => {
    const oneHalfGb = 1.5 * 1024 * 1024 * 1024;
    expect(formatBytes(oneHalfGb)).toBe("1.5 GB");
    const line = formatDownloadsStorageLine({
      trackCount: 3,
      downloadedBytes: oneHalfGb,
    });
    expect(line).toBe("3 tracks · 1.5 GB");
    expect(
      formatDownloadsStorageLine(
        { trackCount: 3, downloadedBytes: oneHalfGb },
        "short",
      ),
    ).toBe(line);
  });

  it("300 B two-track line", () => {
    expect(
      formatDownloadsStorageLine({ trackCount: 2, downloadedBytes: 300 }),
    ).toBe("2 tracks · 300 B");
  });

  it("appends real free when storageFree is set", () => {
    expect(
      formatDownloadsStorageLine({
        trackCount: 2,
        downloadedBytes: 300,
        storageFree: 80 * 1024 * 1024 * 1024,
      }),
    ).toBe("2 tracks · 300 B · 80 GB free");
  });
});

describe("artFileSpecsFromRecords", () => {
  it("emits thumb+full for one album and thumb for one artist", () => {
    const specs = artFileSpecsFromRecords(
      [{ albumId: "alb", hasThumb: true, hasFull: true }],
      [{ artistId: "art", hasThumb: true }],
    );
    expect(specs).toEqual([
      {
        dirParts: albumCoverDirParts(),
        fileName: albumCoverFileName("alb", "thumb"),
      },
      {
        dirParts: albumCoverDirParts(),
        fileName: albumCoverFileName("alb", "full"),
      },
      {
        dirParts: artistCoverDirParts(),
        fileName: artistCoverFileName("art", "thumb"),
      },
    ]);
  });

  it("skips empty flags and stored sizes", () => {
    expect(artFileSpecsFromRecords([], [])).toEqual([]);
    expect(
      artFileSpecsFromRecords(
        [{ albumId: "alb", hasThumb: true, thumbBytes: 12 }],
        [{ artistId: "art", hasThumb: false }],
      ),
    ).toEqual([]);
  });
});
