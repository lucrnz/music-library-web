import { afterEach, describe, expect, it } from "vitest";
import { downloadActionKind } from "@/downloads/actionKind";
import { catalogIndex } from "@/downloads/catalog";
import { downloads } from "@/downloads/state";
import { settings } from "@/stores/settings";
import type { Track } from "@/models/track";
import type { QueueRecord } from "@/downloads/queue";

function track(partial: Partial<Track> & { id: string }): Track {
  return {
    path: "a.flac",
    title: "T",
    artist: "A",
    album: "B",
    albumId: null,
    artistId: null,
    albumArtist: "A",
    albumArtistId: null,
    track: 1,
    disc: 1,
    year: null,
    duration: 1,
    durationMs: 1000,
    isMissing: false,
    sampleRateHz: null,
    bitDepth: null,
    isLossy: false,
    sourceCodec: null,
    bitrateKbps: null,
    bitrateMode: null,
    ...partial,
  };
}

function q(trackId: string, state: string): QueueRecord {
  return {
    trackId,
    state,
    trackCodec: "x",
    codec: "x",
    snapshot: {} as QueueRecord["snapshot"],
    error: null,
    loaded: 0,
    total: null,
    addedAt: 0,
  } as QueueRecord;
}

describe("downloadActionKind", () => {
  afterEach(() => {
    downloads.enabled = false;
    downloads.queue = [];
    catalogIndex.byTrack = {};
    settings.download = "opus_192_48000";
  });

  it("hides when disabled, missing, or no id", () => {
    downloads.enabled = false;
    expect(downloadActionKind(track({ id: "t1" })).kind).toBe("hide");
    downloads.enabled = true;
    expect(downloadActionKind(track({ id: "t1", isMissing: true })).kind).toBe(
      "hide",
    );
    expect(downloadActionKind(null).kind).toBe("hide");
  });

  it("maps queue and catalog states", () => {
    downloads.enabled = true;
    const t = track({ id: "t1" });

    downloads.queue = [q("t1", "pending")];
    expect(downloadActionKind(t).kind).toBe("pending");
    downloads.queue = [q("t1", "active")];
    expect(downloadActionKind(t).kind).toBe("active");
    downloads.queue = [q("t1", "paused")];
    expect(downloadActionKind(t).kind).toBe("paused");
    downloads.queue = [q("t1", "failed")];
    expect(downloadActionKind(t).kind).toBe("retry");

    downloads.queue = [];
    catalogIndex.byTrack = { t1: { codec: "opus_192_48000", status: "ready" } };
    settings.download = "opus_192_48000";
    expect(downloadActionKind(t).kind).toBe("ready");

    catalogIndex.byTrack = { t1: { codec: "flac_16_44100", status: "ready" } };
    expect(downloadActionKind(t).kind).toBe("other");

    catalogIndex.byTrack = {};
    expect(downloadActionKind(t).kind).toBe("download");
  });
});
