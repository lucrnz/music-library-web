/**
 * Artists tree: artist → album → tracks.
 */
import {
  apiGet,
  artistImageUrl,
  coverUrl,
  fetchAlbumTracks,
  fetchArtistAlbums,
} from "../../../api.js";
import { kindForAlbum, kindForTrack } from "../../../lossyKind.js";

/**
 * @typedef {object} TreeNode
 * @property {string} key
 * @property {boolean} isLeaf
 * @property {string} kind
 * @property {string} title
 * @property {string} [subtitle]
 * @property {string} [cover]
 * @property {object} [data]
 */

export async function listArtistRoots() {
  const data = await apiGet("/api/artists?limit=500");
  const items = data.items || [];
  return items.map(
    /** @returns {TreeNode} */ (a) => {
      const n = a.album_count;
      const albums = `${n} album${n === 1 ? "" : "s"}`;
      return {
        key: `artist:${a.id}`,
        isLeaf: false,
        kind: "artist",
        title: a.name || "Unknown artist",
        subtitle: `${albums} · ${a.track_count ?? 0} tracks`,
        cover: artistImageUrl(a, "thumb", false),
        data: a,
      };
    }
  );
}

/**
 * @param {TreeNode} node
 * @returns {Promise<TreeNode[]>}
 */
export async function loadArtistChildren(node) {
  if (node.kind === "artist") {
    const albums = await fetchArtistAlbums(node.data.id);
    return albums.map((al) => ({
      key: `album:${al.id}`,
      isLeaf: false,
      kind: "album",
      title: al.title || "Unknown album",
      subtitle: al.year ? String(al.year) : "",
      cover: coverUrl({ albumId: al.id }, "thumb", false),
      lossyKind: kindForAlbum(al),
      data: al,
    }));
  }
  if (node.kind === "album") {
    const tracks = await fetchAlbumTracks(node.data.id);
    return tracks.map((t) => ({
      key: `track:${t.id}`,
      isLeaf: true,
      kind: "track",
      title: t.title || "",
      subtitle: t.artist || "",
      cover: coverUrl(t, "thumb", false),
      lossyKind: kindForTrack(t),
      data: t,
    }));
  }
  return [];
}
