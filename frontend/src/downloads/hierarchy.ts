/**
 * Build artist → album → tracks tree for manager / offline browse.
 */

import {
  listAlbumRecords,
  listArtistRecords,
  listTrackRecords,
} from "@/downloads/catalog";
import type { CatalogTrackRecord } from "@/models/track";

export interface DownloadsHierarchyAlbum {
  albumId: string;
  title: string;
  hasThumb: boolean;
  tracks: CatalogTrackRecord[];
}

export interface DownloadsHierarchyArtist {
  artistId: string;
  name: string;
  hasThumb: boolean;
  albums: DownloadsHierarchyAlbum[];
}

export interface DownloadsHierarchy {
  artists: DownloadsHierarchyArtist[];
}

export async function buildDownloadsHierarchy(): Promise<DownloadsHierarchy> {
  const [tracks, albums, artists] = await Promise.all([
    listTrackRecords(),
    listAlbumRecords(),
    listArtistRecords(),
  ]);
  const albumMap = new Map(albums.map((a) => [a.albumId, a]));
  const artistMap = new Map(artists.map((a) => [a.artistId, a]));

  const tree = new Map<string, Map<string, CatalogTrackRecord[]>>();
  for (const t of tracks) {
    const aid = t.primaryArtistId || "_unknown";
    const alid = t.albumId || "_no_album";
    let am = tree.get(aid);
    if (!am) {
      am = new Map();
      tree.set(aid, am);
    }
    let list = am.get(alid);
    if (!list) {
      list = [];
      am.set(alid, list);
    }
    list.push(t);
  }

  const result: DownloadsHierarchyArtist[] = [];
  for (const [artistId, albumTracks] of tree) {
    const artistRec = artistMap.get(artistId);
    const albumsOut: DownloadsHierarchyAlbum[] = [];
    for (const [albumId, trs] of albumTracks) {
      trs.sort((a, b) => {
        const d = (a.disc || 0) - (b.disc || 0);
        if (d) return d;
        return (a.trackNum || 0) - (b.trackNum || 0);
      });
      const albumRec = albumMap.get(albumId);
      albumsOut.push({
        albumId,
        title: albumRec?.title || trs[0]?.album || "Unknown album",
        hasThumb: !!albumRec?.hasThumb,
        tracks: trs,
      });
    }
    albumsOut.sort((a, b) => a.title.localeCompare(b.title));
    result.push({
      artistId,
      name:
        artistRec?.name ||
        albumTracks.values().next().value?.[0]?.primaryArtistName ||
        "Unknown artist",
      hasThumb: !!artistRec?.hasThumb,
      albums: albumsOut,
    });
  }
  result.sort((a, b) => a.name.localeCompare(b.name));
  return { artists: result };
}
