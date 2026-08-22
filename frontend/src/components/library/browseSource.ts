/**
 * BrowseSource: load, navigate, covers, chrome, and menu runs for one library mode.
 */
import type { Router } from "vue-router";
import type { BrowseDir } from "@/api";
import type { Artist } from "@/models/artist";
import type { LibraryAlbum, LibraryPage } from "@/components/library/loaders";
import type { Track } from "@/models/track";
import type { TreeNode } from "@/components/tree/sources/artistsSource";

export interface BrowseLoc {
  mode: string;
  routeName: string | symbol | null | undefined;
  folderPath: string;
  artistId?: string;
  albumId?: string;
  searchQuery: string;
  downloadsEnabled: boolean;
}

export interface BrowseGoBackLoc {
  mode: string;
  routeName: string | symbol | null | undefined;
  folderPath: string;
  backArtistId: string | null;
}

export interface BrowseTreeLoad {
  roots: TreeNode[];
  artUrls: Record<string, string>;
}

export interface BrowseChromeInput {
  showTree: boolean;
  mode: string;
  artistId?: string;
  albumId?: string;
  trackCount: number;
  selectedCount: number;
  layout: string;
  downloadsEnabled: boolean;
}

export interface BrowseSource {
  ariaLabel: string;
  showTrackDownload: boolean;
  showFolderSelection: boolean;
  showListLoading: boolean;
  useLocalAlbumCover: boolean;
  useLocalTrackCover: boolean;
  reportsConnectivity: boolean;
  clearsSelectionOnLoad: boolean;

  load(loc: BrowseLoc): Promise<LibraryPage>;
  loadRoots(loc: BrowseLoc): Promise<BrowseTreeLoad>;
  loadChildren(node: TreeNode): Promise<TreeNode[]>;
  resolveCover(node: TreeNode, artUrls: Record<string, string>): string;
  goBack(router: Router, loc: BrowseGoBackLoc): void;
  openArtist(router: Router, artist: { id: string }): void;
  openAlbum(router: Router, album: { id: string }): void;
  openFolder?(router: Router, dir: BrowseDir): void;

  artistCover(artist: Artist, artUrls: Record<string, string>): string;
  albumCover(album: LibraryAlbum, artUrls: Record<string, string>): string;
  trackCover(track: Track, artUrls: Record<string, string>): string;

  showAddAll(opts: BrowseChromeInput): boolean;
  showAddSelected(opts: BrowseChromeInput): boolean;
  showDownloadAlbum(opts: BrowseChromeInput): boolean;

  addAll(ctx: {
    loc: BrowseLoc;
    showTree: boolean;
    tracks: Track[];
  }): Promise<void>;

  includeArtistPhoto(opts: { mode: string; isSearch: boolean }): boolean;

  treeTitle(mode: string): string;
  emptyTreeMessage(opts: { downloadsEnabled: boolean }): string;
  resolveFocusPath(path: string[]): string[];
  treeReloadKeys(): unknown[];

  artistAddAll(id: string): void | Promise<void>;
  albumAddAll(id: string): void | Promise<void>;
  artistDownloadAll?(artist: Artist): void | Promise<void>;
  albumDownload?(album: { id: string }): void | Promise<void>;
  folderAddAll?(path: string): void | Promise<void>;
}

export function browseSourceFor(
  mode: string,
  online: BrowseSource,
  downloads: BrowseSource,
): BrowseSource {
  return mode === "downloads" ? downloads : online;
}
