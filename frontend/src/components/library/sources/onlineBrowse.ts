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
  flags: {
    ariaLabel: "Library",
    showTrackDownload: true,
    showFolderSelection: true,
    showListLoading: false,
    useLocalAlbumCover: false,
    useLocalTrackCover: false,
    reportsConnectivity: true,
    clearsSelectionOnLoad: true,
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

  cover(target) {
    if (target.kind === "artist") return coverSrc(target.artist);
    if (target.kind === "album" || target.kind === "track") return "";
    const node = target.node;
    if (node.kind === "artist") {
      const data = node.data;
      if (data && typeof data === "object" && "id" in data) {
        return coverSrc(data as Artist);
      }
    }
    return node.cover || "";
  },

  chrome(opts) {
    const showAddAll = opts.showTree
      ? opts.mode === "folders"
      : opts.mode === "search" && !opts.artistId && !opts.albumId
        ? false
        : opts.mode === "folders"
          ? true
          : Boolean(opts.artistId || opts.albumId);
    return {
      showAddAll,
      showAddSelected:
        opts.mode === "folders" &&
        opts.selectedCount > 0 &&
        (opts.showTree || opts.layout !== "tree"),
      showDownloadAlbum:
        !opts.showTree &&
        opts.downloadsEnabled &&
        Boolean(opts.albumId) &&
        opts.trackCount > 0,
      includeArtistPhoto: opts.mode === "artists" && !opts.isSearch,
    };
  },

  async addAll({ loc, showTree }) {
    try {
      if (showTree && loc.mode === "folders") {
        await addAllForFolder("");
        return;
      }
      if (loc.mode === "folders") {
        await addAllForFolder(loc.folderPath);
        return;
      }
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
    if (mode === "artists") return "Artists";
    if (mode === "albums") return "Albums";
    return "Folders";
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
