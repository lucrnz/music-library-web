/**
 * Online library BrowseSource.
 */
import type { Router } from "vue-router";
import { coverSrc } from "@/artistArt/state";
import { runArtistDownloadAll } from "@/components/library/artistMenuItems";
import type { BrowseSource } from "@/components/library/browseSource";
import {
  addAllForAlbum,
  addAllForArtist,
  downloadAlbumById,
  playAllForAlbum,
  playAllForArtist,
} from "@/components/library/libraryActions";
import {
  loadLibraryPage,
  type LibraryAlbum,
  type LibraryPage,
} from "@/components/library/loaders";
import { listAlbumRoots, loadAlbumChildren } from "@/components/tree/sources/albumsSource";
import {
  listArtistRoots,
  loadArtistChildren,
} from "@/components/tree/sources/artistsSource";
import type { TreeNode } from "@/components/tree/treeNode";

function goBack(
  router: Router,
  loc: {
    mode: string;
    routeName: string | symbol | null | undefined;
    backArtistId: string | null;
  },
) {
  if (loc.routeName === "album") {
    if (loc.backArtistId) {
      void router.push({ name: "artist", params: { artistId: loc.backArtistId } });
      return;
    }
    void router.push({ name: "albums" });
    return;
  }
  if (loc.routeName === "artist") {
    void router.push({ name: "artists" });
    return;
  }
  void router.push({
    name: loc.mode === "artists" ? "artists" : "albums",
  });
}

export const onlineBrowse: BrowseSource = {
  flags: {
    ariaLabel: "Library",
    showTrackDownload: true,
    showListLoading: false,
    useLocalAlbumCover: false,
    useLocalTrackCover: false,
    reportsConnectivity: true,
  },

  load(loc): Promise<LibraryPage> {
    return loadLibraryPage(loc);
  },

  async loadRoots(loc) {
    if (loc.mode === "artists") {
      return { roots: await listArtistRoots(), artUrls: {} };
    }
    if (loc.mode === "albums") {
      return { roots: await listAlbumRoots(), artUrls: {} };
    }
    return { roots: [], artUrls: {} };
  },

  loadChildren(node: TreeNode) {
    if (node.kind === "artist") return loadArtistChildren(node);
    if (node.kind === "album") return loadAlbumChildren(node);
    return Promise.resolve([] as TreeNode[]);
  },

  goBack,

  openArtist(router, artist) {
    void router.push({ name: "artist", params: { artistId: artist.id } });
  },

  openAlbum(router, album) {
    void router.push({ name: "album", params: { albumId: album.id } });
  },

  cover(target) {
    if (target.kind === "artist") return coverSrc(target.artist);
    if (target.kind === "album" || target.kind === "track") return "";
    const node = target.node;
    if (node.kind === "artist") {
      return coverSrc(node.data);
    }
    return node.cover || "";
  },

  chrome(opts) {
    return {
      showAddAll: !opts.showTree && Boolean(opts.artistId || opts.albumId),
      showDownloadAlbum:
        !opts.showTree &&
        opts.downloadsEnabled &&
        Boolean(opts.albumId) &&
        opts.trackCount > 0,
      includeArtistPhoto: opts.mode === "artists" && !opts.isSearch,
    };
  },

  async addAll({ loc }) {
    try {
      if (loc.routeName === "album" && loc.albumId) {
        await addAllForAlbum(loc.albumId);
        return;
      }
      if (loc.routeName === "artist" && loc.artistId) {
        await addAllForArtist(loc.artistId);
      }
    } catch (err: unknown) {
      console.error(err);
    }
  },

  treeTitle(mode) {
    if (mode === "albums") return "Albums";
    return "Artists";
  },

  emptyTreeMessage() {
    return "Nothing here yet";
  },

  resolveFocusPath(path) {
    return path;
  },

  treeReloadKeys() {
    return [];
  },

  artistAddAll(id) {
    return addAllForArtist(id);
  },

  albumAddAll(id) {
    return addAllForAlbum(id);
  },

  artistPlayAll(id) {
    return playAllForArtist(id);
  },

  albumPlayAll(id) {
    return playAllForAlbum(id);
  },

  artistDownloadAll(artist) {
    return runArtistDownloadAll(artist);
  },

  albumDownload(album) {
    return downloadAlbumById(album.id);
  },
};

export type { LibraryAlbum };
