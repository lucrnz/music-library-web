/**
 * Downloads BrowseSource pieces: load, navigate, add-all, local covers.
 */
import type { Router } from "vue-router";
import type { ArtistListItem } from "@/api";
import { addAllDownloadedAlbum, addAllDownloadedArtist } from "@/downloads/addAll";
import { loadDownloadsView } from "@/downloads/browse";
import { artUrlCache } from "@/downloads/catalog";
import { addToQueue } from "@/stores/playlist";
import type { LibraryAlbum, LibraryPage } from "@/components/library/loaders";
import type { Track } from "@/models/track";

export function loadDownloadsPage(opts: {
  routeName: string;
  artistId?: string;
  albumId?: string;
  enabled: boolean;
}): Promise<LibraryPage> {
  return loadDownloadsView(opts);
}

export function downloadsArtistCover(
  artist: ArtistListItem,
  artUrls: Record<string, string>,
): string {
  return (
    artUrlCache.urls[`artist:${artist.id}:thumb`] ||
    artUrls[`a:${artist.id}`] ||
    ""
  );
}

export function downloadsAlbumCover(
  album: LibraryAlbum,
  artUrls: Record<string, string>,
): string {
  return artUrls[`al:${album.id}`] || "";
}

export function downloadsTrackCover(
  track: Track,
  artUrls: Record<string, string>,
): string {
  return (track.albumId && artUrls[`al:${track.albumId}`]) || "";
}

export function downloadsGoBack(
  router: Router,
  loc: {
    routeName: string | symbol | null | undefined;
    backArtistId: string | null;
  },
) {
  if (loc.routeName === "downloads-album") {
    if (loc.backArtistId) {
      void router.push({
        name: "downloads-artist",
        params: { artistId: loc.backArtistId },
      });
      return;
    }
    void router.push({ name: "downloads" });
    return;
  }
  void router.push({ name: "downloads" });
}

export function downloadsOpenArtist(router: Router, artist: { id: string }) {
  void router.push({
    name: "downloads-artist",
    params: { artistId: artist.id },
  });
}

export function downloadsOpenAlbum(router: Router, album: { id: string }) {
  void router.push({
    name: "downloads-album",
    params: { albumId: album.id },
  });
}

export function downloadsShowAddAll(opts: {
  showTree: boolean;
  trackCount: number;
}): boolean {
  if (opts.showTree) return false;
  return opts.trackCount > 0;
}

export async function downloadsAddAll(tracks: Track[]) {
  try {
    await addToQueue(tracks);
  } catch (err: unknown) {
    console.error(err);
  }
}

export { addAllDownloadedAlbum, addAllDownloadedArtist };
