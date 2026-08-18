/**
 * Discriminated open target for library / downloads entity menus.
 */
import type { ArtistListItem, BrowseDir } from "@/api";
import type { FileRowModel, LibraryAlbum } from "@/components/library/loaders";
import type { Track } from "@/models/track";

export type OpenMenu =
  | { kind: "artist"; artist: ArtistListItem }
  | { kind: "album"; album: LibraryAlbum }
  | { kind: "track"; track: Track }
  | { kind: "file"; file: FileRowModel }
  | { kind: "folder"; dir: BrowseDir };

export function openMenuKey(target: OpenMenu): string {
  switch (target.kind) {
    case "artist":
      return `artist:${target.artist.id}`;
    case "album":
      return `album:${target.album.id}`;
    case "track":
      return `track:${target.track.id}`;
    case "file":
      return `file:${target.file.path}`;
    case "folder":
      return `folder:${target.dir.path}`;
  }
}
