/**
 * Online library BrowseSource pieces: load, navigate, add-all, covers.
 */
import type { Router } from "vue-router";
import { coverSrc } from "@/artistArt/state";
import type { ArtistListItem, BrowseDir } from "@/api";
import {
  addAll as addAllAction,
  addAllForFolder,
} from "@/components/library/libraryActions";
import {
  loadLibraryPage,
  type LibraryAlbum,
  type LibraryPage,
} from "@/components/library/loaders";

export interface OnlineBrowseLoc {
  mode: string;
  routeName: string | symbol | null | undefined;
  folderPath: string;
  artistId?: string;
  albumId?: string;
  searchQuery: string;
}

export function loadOnlinePage(loc: OnlineBrowseLoc): Promise<LibraryPage> {
  return loadLibraryPage(loc);
}

export function onlineArtistCover(artist: ArtistListItem): string {
  return coverSrc(artist);
}

export function onlineGoBack(
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

export function onlineOpenArtist(router: Router, artist: { id: string }) {
  void router.push({ name: "artist", params: { artistId: artist.id } });
}

export function onlineOpenAlbum(router: Router, album: { id: string }) {
  void router.push({ name: "album", params: { albumId: album.id } });
}

export function onlineOpenFolder(router: Router, dir: BrowseDir) {
  void router.push({ name: "folders", query: { path: dir.path } });
}

export async function onlineAddAll(
  loc: OnlineBrowseLoc,
  opts: { showTree: boolean },
) {
  if (opts.showTree && loc.mode === "folders") {
    try {
      await addAllForFolder("");
    } catch (err: unknown) {
      console.error(err);
    }
    return;
  }
  await addAllAction(loc);
}

export function onlineShowAddAll(opts: {
  showTree: boolean;
  mode: string;
  artistId?: string;
  albumId?: string;
}): boolean {
  if (opts.showTree) return opts.mode === "folders";
  if (opts.mode === "search" && !opts.artistId && !opts.albumId) return false;
  if (opts.mode === "folders") return true;
  return Boolean(opts.artistId || opts.albumId);
}

export function onlineShowAddSelected(opts: {
  mode: string;
  selectedCount: number;
  showTree: boolean;
  layout: string;
}): boolean {
  return (
    opts.mode === "folders" &&
    opts.selectedCount > 0 &&
    (opts.showTree || opts.layout !== "tree")
  );
}

export function onlineShowDownloadAlbum(opts: {
  showTree: boolean;
  enabled: boolean;
  albumId?: string;
  trackCount: number;
}): boolean {
  if (opts.showTree) return false;
  return opts.enabled && Boolean(opts.albumId) && opts.trackCount > 0;
}

export type { LibraryAlbum };
