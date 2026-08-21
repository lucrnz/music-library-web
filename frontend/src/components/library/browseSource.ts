/**
 * BrowseSource: load, navigate, covers, chrome, and menu runs for one library mode.
 */
import type { Router } from "vue-router";
import type { ArtistListItem, BrowseDir } from "@/api";
import type { LibraryAlbum, LibraryPage } from "@/components/library/loaders";
import type { Track } from "@/models/track";

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
  goBack(router: Router, loc: BrowseGoBackLoc): void;
  openArtist(router: Router, artist: { id: string }): void;
  openAlbum(router: Router, album: { id: string }): void;
  openFolder?(router: Router, dir: BrowseDir): void;

  artistCover(artist: ArtistListItem, artUrls: Record<string, string>): string;
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

  artistAddAll(id: string): void | Promise<void>;
  albumAddAll(id: string): void | Promise<void>;
  artistDownloadAll?(artist: ArtistListItem): void | Promise<void>;
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
