/**
 * Library queue / download actions (not view wiring).
 */

import {
  collectTracks,
  fetchAlbumTracks,
  fetchArtistAlbums,
} from "@/api";
import { isLocallyPlayableDownload } from "@/downloads/catalog";
import { downloadTracks } from "@/downloads/ui";
import { downloads } from "@/downloads/state";
import { addToQueue } from "@/stores/playlist";
import { clearLibSelection, showToast, ui } from "@/stores/ui";
import type { Track } from "@/models/track";

export async function addAllForFolder(path: string): Promise<void> {
  await addToQueue(await collectTracks(path || ""));
}

export async function collectArtistDownloadTracks(
  artistId: string,
): Promise<{ remaining: Track[]; playableCount: number }> {
  if (!artistId) return { remaining: [], playableCount: 0 };
  const albumList = await fetchArtistAlbums(artistId);
  const trackLists = await Promise.all(
    albumList.map((album) => fetchAlbumTracks(album.id)),
  );
  let playableCount = 0;
  const remaining: Track[] = [];
  for (const track of trackLists.flat()) {
    if (!track.id || track.isMissing) continue;
    if (isLocallyPlayableDownload(track.id)) {
      playableCount += 1;
      continue;
    }
    remaining.push(track);
  }
  return { remaining, playableCount };
}

export async function addAllForArtist(artistId: string): Promise<void> {
  if (!artistId) return;
  const albumList = await fetchArtistAlbums(artistId);
  const trackLists = await Promise.all(
    albumList.map((album) => fetchAlbumTracks(album.id)),
  );
  await addToQueue(trackLists.flat());
}

export async function addAllForAlbum(albumId: string): Promise<void> {
  if (!albumId) return;
  await addToQueue(await fetchAlbumTracks(albumId));
}

export async function downloadAlbumById(albumId: string): Promise<void> {
  if (!downloads.enabled || !albumId) return;
  try {
    const tracks = await fetchAlbumTracks(albumId);
    await downloadTracks(tracks.filter((t) => t.id && !t.isMissing));
  } catch (err: unknown) {
    console.error(err);
    showToast(err instanceof Error ? err.message : "Download failed");
  }
}

/** Collect + queue tracks for currently multi-selected folder paths. */
export async function addSelected(): Promise<void> {
  if (!ui.libSelected.size) return;
  const tracksOut = (
    await Promise.all(
      [...ui.libSelected].map(async ([p]) => {
        try {
          return await collectTracks(p);
        } catch (err: unknown) {
          console.error(err);
          return [];
        }
      }),
    )
  ).flat();
  clearLibSelection();
  await addToQueue(tracksOut);
}
