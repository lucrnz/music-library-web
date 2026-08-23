/**
 * Library queue / download actions (not view wiring).
 */

import { fetchAlbumTracks, fetchArtistAlbums } from "@/api";
import { isLocallyPlayableDownload } from "@/downloads/catalog";
import { downloadTracks } from "@/downloads/ui";
import { downloads } from "@/downloads/state";
import { addToQueue } from "@/stores/playlist";
import { showToast } from "@/stores/ui";
import type { Track } from "@/models/track";

async function playCollected(entries: Track[]) {
  const { playAllTracks } = await import("@/stores/player");
  await playAllTracks(entries);
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

async function collectArtistTracks(artistId: string): Promise<Track[]> {
  if (!artistId) return [];
  const albumList = await fetchArtistAlbums(artistId);
  const trackLists = await Promise.all(
    albumList.map((album) => fetchAlbumTracks(album.id)),
  );
  return trackLists.flat();
}

export async function addAllForArtist(artistId: string): Promise<void> {
  await addToQueue(await collectArtistTracks(artistId));
}

export async function playAllForArtist(artistId: string): Promise<void> {
  await playCollected(await collectArtistTracks(artistId));
}

export async function addAllForAlbum(albumId: string): Promise<void> {
  if (!albumId) return;
  await addToQueue(await fetchAlbumTracks(albumId));
}

export async function playAllForAlbum(albumId: string): Promise<void> {
  if (!albumId) return;
  await playCollected(await fetchAlbumTracks(albumId));
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
