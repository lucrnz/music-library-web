/**
 * Downloads BrowseSource.
 */
import type { Artist } from "@/models/artist";
import type { BrowseSource } from "@/components/library/browseSource";
import type { LibraryAlbum, LibraryPage } from "@/components/library/loaders";
import { addAllDownloadedAlbum, addAllDownloadedArtist } from "@/downloads/addAll";
import { loadDownloadsView } from "@/downloads/browse";
import { artUrlCache } from "@/downloads/catalog";
import { downloads } from "@/downloads/state";
import type { Track } from "@/models/track";
import { addToQueue } from "@/stores/playlist";
import { resolveDownloadsFocusPath } from "@/components/tree/treeNavigation";
import { loadDownloadsChildren } from "@/components/tree/sources/downloadsSource";
import type { TreeNode } from "@/components/tree/sources/artistsSource";
import type { DownloadsHierarchy } from "@/downloads/hierarchy";
import { loadDownloadsCatalogView } from "@/downloads/snapshot";

let lastHierarchy: DownloadsHierarchy | null = null;

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

  async loadRoots(loc) {
    if (!loc.downloadsEnabled) {
      lastHierarchy = null;
      return { roots: [], artUrls: {} };
    }
    const snap = await loadDownloadsCatalogView();
    lastHierarchy = snap.hierarchy;
    return {
      roots: snap.roots,
      artUrls: snap.artUrls,
    };
  },

  loadChildren(node: TreeNode) {
    return loadDownloadsChildren(node);
  },

  resolveCover(node: TreeNode, artUrls) {
    if (node.kind === "artist") {
      const data = node.data;
      const id =
        data && typeof data === "object" && "id" in data
          ? String((data as Artist).id || "")
          : "";
      if (id) {
        return (
          artUrlCache.urls[`artist:${id}:thumb`] ||
          artUrls[`artist:${id}:thumb`] ||
          node.cover ||
          ""
        );
      }
    }
    if (node.kind === "album") {
      const album = node.data as LibraryAlbum | undefined;
      if (album?.id) {
        return artUrls[`cover:${album.id}:thumb`] || node.cover || "";
      }
    }
    if (node.kind === "track") {
      const track = node.data as Track | undefined;
      if (track?.albumId) {
        return artUrls[`cover:${track.albumId}:thumb`] || node.cover || "";
      }
    }
    return node.cover || "";
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

  artistCover(artist: Artist, artUrls) {
    return (
      artUrlCache.urls[`artist:${artist.id}:thumb`] ||
      artUrls[`artist:${artist.id}:thumb`] ||
      ""
    );
  },

  albumCover(album: LibraryAlbum, artUrls) {
    return artUrls[`cover:${album.id}:thumb`] || "";
  },

  trackCover(track: Track, artUrls) {
    return (track.albumId && artUrls[`cover:${track.albumId}:thumb`]) || "";
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

  treeTitle() {
    return "Downloads";
  },

  emptyTreeMessage(opts) {
    return opts.downloadsEnabled
      ? "No downloads yet"
      : "Enable downloads in Settings";
  },

  resolveFocusPath(path) {
    if (!lastHierarchy) return path;
    return resolveDownloadsFocusPath(path, lastHierarchy);
  },

  treeReloadKeys() {
    return [downloads.enabled, downloads.trackCount];
  },

  artistAddAll(id) {
    return addAllDownloadedArtist(id);
  },

  albumAddAll(id) {
    return addAllDownloadedAlbum(id);
  },
};
