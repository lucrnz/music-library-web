/**
 * Discriminated open target for library / downloads entity menus.
 */
import type { Artist } from "@/models/artist";
import type { LibraryAlbum } from "@/components/library/loaders";
import type { Track } from "@/models/track";

export type OpenMenu =
  | { kind: "artist"; artist: Artist }
  | { kind: "album"; album: LibraryAlbum }
  | { kind: "track"; track: Track };

export function openMenuKey(target: OpenMenu): string {
  switch (target.kind) {
    case "artist":
      return `artist:${target.artist.id}`;
    case "album":
      return `album:${target.album.id}`;
    case "track":
      return `track:${target.track.id}`;
  }
}
