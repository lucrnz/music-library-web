/**
 * Queue tracks from the offline downloads catalog. No /api.
 */
import { loadDownloadsCatalogView } from "@/downloads/snapshot";
import { addToQueue } from "@/stores/playlist";
import { tracksFromCatalogRecords } from "@/models/track";

export async function addAllDownloadedAlbum(albumId: string): Promise<void> {
  if (!albumId) return;
  const { hierarchy: tree } = await loadDownloadsCatalogView();
  for (const artist of tree.artists) {
    const album = artist.albums.find((a) => a.albumId === albumId);
    if (!album) continue;
    await addToQueue(tracksFromCatalogRecords(album.tracks));
    return;
  }
}

export async function addAllDownloadedArtist(artistId: string): Promise<void> {
  if (!artistId) return;
  const { hierarchy: tree } = await loadDownloadsCatalogView();
  const artist = tree.artists.find((a) => a.artistId === artistId);
  if (!artist) return;
  const records = artist.albums.flatMap((album) => album.tracks);
  await addToQueue(tracksFromCatalogRecords(records));
}
