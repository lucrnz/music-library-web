/**
 * Queue tracks from the offline downloads catalog. No /api.
 */
import { buildDownloadsHierarchy } from "@/downloads/hierarchy";
import { addToQueue } from "@/stores/playlist";
import { tracksFromCatalogRecords } from "@/models/track";

export async function addAllDownloadedAlbum(albumId: string): Promise<void> {
  if (!albumId) return;
  const tree = await buildDownloadsHierarchy();
  for (const artist of tree.artists) {
    const album = artist.albums.find((a) => a.albumId === albumId);
    if (!album) continue;
    await addToQueue(tracksFromCatalogRecords(album.tracks));
    return;
  }
}

export async function addAllDownloadedArtist(artistId: string): Promise<void> {
  if (!artistId) return;
  const tree = await buildDownloadsHierarchy();
  const artist = tree.artists.find((a) => a.artistId === artistId);
  if (!artist) return;
  const records = artist.albums.flatMap((album) => album.tracks);
  await addToQueue(tracksFromCatalogRecords(records));
}
