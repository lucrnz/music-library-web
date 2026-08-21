/**
 * Online library BrowseSource.
 */
import type { Router } from "vue-router";
import { coverSrc } from "@/artistArt/state";
import type { BrowseDir } from "@/api";
import type { Artist } from "@/models/artist";
import { runArtistDownloadAll } from "@/components/library/artistMenuItems";
import type { BrowseSource } from "@/components/library/browseSource";
import {
  addAll as addAllAction,
  addAllForAlbum,
  addAllForArtist,
  addAllForFolder,
  downloadAlbumById,
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
  type TreeNode,
} from "@/components/tree/sources/artistsSource";
import {
  listFolderRoots,
  loadFolderNodeChildren,
} from "@/components/tree/sources/foldersSource";

export interface OnlineBrowseLoc {
  mode: string;
  routeName: string | symbol | null | undefined;
  folderPath: string;
  artistId?: string;
  albumId?: string;
  searchQuery: string;
}

function goBack(
  router: Router,
  loc: {
    mode: string;
    routeName: string | symbol | null | undefined;
    folderPath: string;
    backArtistId: string | null;
  },
) {
  if (loc.mode === "folders" && loc.folderPath) {
    const parts = loc.folderPath.split("/").filter(Boolean);
    parts.pop();
    const parent = parts.join("/");
    void router.push({
      name: "folders",
      query: parent ? { path: parent } : {},
    });
    return;
  }
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
  ariaLabel: "Library",
  showTrackDownload: true,
  showFolderSelection: true,
  showListLoading: false,
  useLocalAlbumCover: false,
  useLocalTrackCover: false,
  reportsConnectivity: true,
  clearsSelectionOnLoad: true,

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
    if (loc.mode === "folders") {
      return { roots: await listFolderRoots(), artUrls: {} };
    }
    return { roots: [], artUrls: {} };
  },

  loadChildren(node: TreeNode) {
    if (node.kind === "artist") return loadArtistChildren(node);
    if (node.kind === "album") return loadAlbumChildren(node);
    if (node.kind === "dir") return loadFolderNodeChildren(node);
    return Promise.resolve([] as TreeNode[]);
  },

  resolveCover(node: TreeNode) {
    if (node.kind === "artist") {
      const data = node.data;
      if (data && typeof data === "object" && "id" in data) {
        return coverSrc(data as Artist);
      }
    }
    return node.cover || "";
  },

  goBack,

  openArtist(router, artist) {
    void router.push({ name: "artist", params: { artistId: artist.id } });
  },

  openAlbum(router, album) {
    void router.push({ name: "album", params: { albumId: album.id } });
  },

  openFolder(router, dir: BrowseDir) {
    void router.push({ name: "folders", query: { path: dir.path } });
  },

  artistCover(artist: Artist) {
    return coverSrc(artist);
  },

  albumCover() {
    return "";
  },

  trackCover() {
    return "";
  },

  showAddAll(opts) {
    if (opts.showTree) return opts.mode === "folders";
    if (opts.mode === "search" && !opts.artistId && !opts.albumId) return false;
    if (opts.mode === "folders") return true;
    return Boolean(opts.artistId || opts.albumId);
  },

  showAddSelected(opts) {
    return (
      opts.mode === "folders" &&
      opts.selectedCount > 0 &&
      (opts.showTree || opts.layout !== "tree")
    );
  },

  showDownloadAlbum(opts) {
    if (opts.showTree) return false;
    return opts.downloadsEnabled && Boolean(opts.albumId) && opts.trackCount > 0;
  },

  async addAll({ loc, showTree }) {
    if (showTree && loc.mode === "folders") {
      try {
        await addAllForFolder("");
      } catch (err: unknown) {
        console.error(err);
      }
      return;
    }
    await addAllAction(loc);
  },

  includeArtistPhoto(opts) {
    return opts.mode === "artists" && !opts.isSearch;
  },

  artistAddAll(id) {
    return addAllForArtist(id);
  },

  albumAddAll(id) {
    return addAllForAlbum(id);
  },

  artistDownloadAll(artist) {
    return runArtistDownloadAll(artist);
  },

  albumDownload(album) {
    return downloadAlbumById(album.id);
  },

  folderAddAll(path) {
    return addAllForFolder(path);
  },
};

export type { LibraryAlbum };
