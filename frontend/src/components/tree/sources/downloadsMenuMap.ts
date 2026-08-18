/**
 * Project downloads tree node data into entity-menu types.
 */
import type { ArtistListItem } from "@/api";
import type { LibraryAlbum } from "@/components/library/loaders";
import type {
  DownloadsHierarchyAlbum,
  DownloadsHierarchyArtist,
} from "@/downloads/hierarchy";
import { fromCatalogRecord, type CatalogTrackRecord, type Track } from "@/models/track";

export function artistFromDl(artist: DownloadsHierarchyArtist): ArtistListItem {
  return {
    id: artist.artistId,
    name: artist.name,
    album_count: artist.albums.length,
    track_count: artist.albums.reduce((n, al) => n + al.tracks.length, 0),
    has_preferred_image: false,
    preferred_rev: 0,
  };
}

export function albumFromDl(
  album: DownloadsHierarchyAlbum,
  artistName: string,
): LibraryAlbum {
  return {
    id: album.albumId,
    title: album.title,
    artist: artistName,
    trackCount: album.tracks.length,
  };
}

export function trackFromDl(rec: CatalogTrackRecord): Track {
  return fromCatalogRecord(rec);
}
