/**
 * Downloads BrowseSource.
 */
import type { ArtistListItem } from "@/api";
import type { BrowseSource } from "@/components/library/browseSource";
import type { LibraryAlbum, LibraryPage } from "@/components/library/loaders";
import { addAllDownloadedAlbum, addAllDownloadedArtist } from "@/downloads/addAll";
import { loadDownloadsView } from "@/downloads/browse";
import { artUrlCache } from "@/downloads/catalog";
import type { Track } from "@/models/track";
import { addToQueue } from "@/stores/playlist";

export const downloadsBrowse: BrowseSource = {
  ariaLabel: "Downloads library",
  showTrackDownload: false,
  showFolderSelection: false,
  showListLoading: true,
  useLocalAlbumCover: true,
  useLocalTrackCover: true,
  reportsConnectivity: false,
  clearsSelectionOnLoad: false,

  load(loc): Promise<LibraryPage> {
    return loadDownloadsView({
      routeName: String(loc.routeName || ""),
      artistId: loc.artistId,
      albumId: loc.albumId,
      enabled: loc.downloadsEnabled,
    });
  },

  goBack(router, loc) {
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
  },

  openArtist(router, artist) {
    void router.push({
      name: "downloads-artist",
      params: { artistId: artist.id },
    });
  },

  openAlbum(router, album) {
    void router.push({
      name: "downloads-album",
      params: { albumId: album.id },
    });
  },

  artistCover(artist: ArtistListItem, artUrls) {
    return (
      artUrlCache.urls[`artist:${artist.id}:thumb`] ||
      artUrls[`a:${artist.id}`] ||
      ""
    );
  },

  albumCover(album: LibraryAlbum, artUrls) {
    return artUrls[`al:${album.id}`] || "";
  },

  trackCover(track: Track, artUrls) {
    return (track.albumId && artUrls[`al:${track.albumId}`]) || "";
  },

  showAddAll(opts) {
    if (opts.showTree) return false;
    return opts.trackCount > 0;
  },

  showAddSelected() {
    return false;
  },

  showDownloadAlbum() {
    return false;
  },

  async addAll({ tracks }) {
    try {
      await addToQueue(tracks);
    } catch (err: unknown) {
      console.error(err);
    }
  },

  includeArtistPhoto() {
    return false;
  },

  artistAddAll(id) {
    return addAllDownloadedArtist(id);
  },

  albumAddAll(id) {
    return addAllDownloadedAlbum(id);
  },
};
