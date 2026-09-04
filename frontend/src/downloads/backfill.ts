/**
 * Quiet companion backfill for existing catalog rows.
 * Not a download-manager job; yields while the user queue has work.
 */

import { canReachServer, isHardOffline } from "@/connectivity";
import {
  ensureAlbumArtFiles,
  ensureArtistPhoto,
} from "@/downloads/art";
import { getOne } from "@/downloads/db";
import { queueHasWork } from "@/downloads/queue";
import {
  getTrackRecord,
  listTrackRecords,
  type CatalogAlbumRecord,
  type CatalogArtistRecord,
} from "@/downloads/writer";
import { getLyricsRecord } from "@/downloads/lyricsStore";
import { cacheLyricsForDownload } from "@/lyrics/cache";

const QUEUE_RETRY_MS = 2000;

let walkInFlight = false;
let walkScheduled = false;
let retryTimer: ReturnType<typeof setTimeout> | null = null;

function pinArtistIds(rec: {
  artistIds?: string[];
  primaryArtistId?: string;
}): string[] {
  if (rec.artistIds?.length) return rec.artistIds;
  if (rec.primaryArtistId) return [rec.primaryArtistId];
  return [];
}

function artistNeedsPhoto(artist: CatalogArtistRecord | undefined): boolean {
  if (!artist) return false;
  const flagsMissing =
    artist.hasImage === undefined &&
    artist.hasPreferredImage === undefined &&
    artist.isVa === undefined;
  if (flagsMissing) return true;
  if (artist.isVa) return false;
  return !!(artist.hasImage || artist.hasPreferredImage) && !artist.hasFull;
}

function yieldToUi(): Promise<void> {
  return new Promise((resolve) => {
    if (typeof requestAnimationFrame === "function") {
      requestAnimationFrame(() => resolve());
    } else {
      setTimeout(resolve, 0);
    }
  });
}

function scheduleRetry() {
  if (retryTimer != null || walkScheduled || walkInFlight) return;
  retryTimer = setTimeout(() => {
    retryTimer = null;
    requestCompanionsBackfill();
  }, QUEUE_RETRY_MS);
}

/** One catalog row: missing album art, artist photo/flags, and lyrics. */
export async function backfillTrack(trackId: string): Promise<void> {
  if (!trackId || !canReachServer() || isHardOffline()) return;
  const rec = await getTrackRecord(trackId);
  if (!rec) return;

  if (rec.albumId) {
    const album = await getOne<CatalogAlbumRecord>("albums", rec.albumId);
    if (album && (!album.hasThumb || !album.hasFull)) {
      await ensureAlbumArtFiles(rec.albumId);
    }
  }

  for (const aid of pinArtistIds(rec)) {
    if (!aid || aid === "_unknown") continue;
    const artist = await getOne<CatalogArtistRecord>("artists", aid);
    if (artistNeedsPhoto(artist)) {
      await ensureArtistPhoto(aid);
    }
  }

  const lyrics = await getLyricsRecord(trackId);
  const status = lyrics?.payload?.status;
  if (!lyrics || status === "not_found") {
    await cacheLyricsForDownload(trackId);
  }
}

async function runWalk(): Promise<void> {
  if (walkInFlight) return;
  if (!canReachServer() || isHardOffline()) return;
  walkInFlight = true;
  try {
    const tracks = await listTrackRecords();
    for (const rec of tracks) {
      if (!canReachServer() || isHardOffline()) return;
      if (await queueHasWork()) {
        scheduleRetry();
        return;
      }
      await backfillTrack(rec.trackId);
      await yieldToUi();
    }
  } finally {
    walkInFlight = false;
  }
}

/** Idempotent schedule of the quiet catalog walk. */
export function requestCompanionsBackfill(): void {
  if (walkInFlight || walkScheduled) return;
  walkScheduled = true;
  setTimeout(() => {
    walkScheduled = false;
    void runWalk();
  }, 0);
}

/** Tests only. */
export function resetCompanionsBackfillForTests(): void {
  walkInFlight = false;
  walkScheduled = false;
  if (retryTimer != null) {
    clearTimeout(retryTimer);
    retryTimer = null;
  }
}
