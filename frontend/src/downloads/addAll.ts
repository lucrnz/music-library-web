/**
 * Queue tracks from the offline downloads catalog. No /api.
 */
import { loadDownloadsCatalogView } from "@/downloads/snapshot";
import { addToQueue } from "@/stores/playlist";
import { tracksFromCatalogRecords } from "@/models/track";
import type { Track } from "@/models/track";

async function playCollected(tracks: Track[]) {
  const { playAllTracks } = await import("@/stores/player");
  await playAllTracks(tracks);
}

async function catalogAlbumTracks(albumId: string): Promise<Track[] | null> {
  if (!albumId) return null;
  const { hierarchy: tree } = await loadDownloadsCatalogView();
  for (const artist of tree.artists) {
    const album = artist.albums.find((a) => a.albumId === albumId);
    if (album) return tracksFromCatalogRecords(album.tracks);
  }
  return null;
}

async function catalogArtistTracks(artistId: string): Promise<Track[] | null> {
  if (!artistId) return null;
  const { hierarchy: tree } = await loadDownloadsCatalogView();
  const artist = tree.artists.find((a) => a.artistId === artistId);
  if (!artist) return null;
  return tracksFromCatalogRecords(
    artist.albums.flatMap((album) => album.tracks),
  );
}

export async function addAllDownloadedAlbum(albumId: string): Promise<void> {
  const tracks = await catalogAlbumTracks(albumId);
  if (!tracks) return;
  await addToQueue(tracks);
}

export async function playAllDownloadedAlbum(albumId: string): Promise<void> {
  const tracks = await catalogAlbumTracks(albumId);
  if (!tracks) return;
  await playCollected(tracks);
}

export async function addAllDownloadedArtist(artistId: string): Promise<void> {
  const tracks = await catalogArtistTracks(artistId);
  if (!tracks) return;
  await addToQueue(tracks);
}

export async function playAllDownloadedArtist(artistId: string): Promise<void> {
  const tracks = await catalogArtistTracks(artistId);
  if (!tracks) return;
  await playCollected(tracks);
}
