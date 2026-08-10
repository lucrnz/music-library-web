/**
 * HTTP helpers + named track/library fetchers.
 * Track-bearing responses are normalized here — leaves do not call bare
 * apiGet for track lists.
 */

import { fromApiTrack, mapTracks } from "./models/track.js";

export async function apiGet(url) {
  const res = await fetch(url);
  if (!res.ok) {
    const detail = await res.text().catch(() => res.statusText);
    throw new Error(detail || res.statusText);
  }
  return res.json();
}

export async function apiPost(url, body) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => res.statusText);
    throw new Error(detail || res.statusText);
  }
  return res.json();
}

export async function apiPut(url, body) {
  const res = await fetch(url, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => res.statusText);
    throw new Error(detail || res.statusText);
  }
  return res.json();
}

export async function apiPatch(url, body) {
  const res = await fetch(url, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => res.statusText);
    throw new Error(detail || res.statusText);
  }
  return res.json();
}

export async function apiDelete(url) {
  const res = await fetch(url, { method: "DELETE" });
  if (!res.ok) {
    const detail = await res.text().catch(() => res.statusText);
    throw new Error(detail || res.statusText);
  }
  return res.json().catch(() => ({}));
}

/**
 * Cover URL for a Track (or album-only ref).
 * Query params stay snake_case for the HTTP API.
 *
 * @param {{ albumId?: string|null, id?: string|null }|null} ref
 * @param {'full'|'thumb'} size
 * @param {boolean} bust
 */
export function coverUrl(ref, size, bust = true) {
  if (!ref || typeof ref !== "object") {
    return "/static/img/placeholder.svg";
  }
  const albumId = ref.albumId || null;
  const trackId = ref.id || null;
  let base;
  if (albumId) {
    base = `/api/cover?album_id=${encodeURIComponent(albumId)}&size=${size}`;
  } else if (trackId) {
    base = `/api/cover?track_id=${encodeURIComponent(trackId)}&size=${size}`;
  } else {
    return "/static/img/placeholder.svg";
  }
  return bust ? `${base}&t=${Date.now()}` : base;
}

/**
 * Artist profile image URL by artist id.
 * @param {string | { id?: string }} artistOrId
 * @param {'full'|'thumb'} size
 * @param {boolean} bust
 */
export function artistImageUrl(artistOrId, size = "thumb", bust = false) {
  const id =
    typeof artistOrId === "string"
      ? artistOrId
      : artistOrId && typeof artistOrId === "object"
        ? artistOrId.id
        : null;
  if (!id) return "/static/img/placeholder.svg";
  const base = `/api/artist-image?artist_id=${encodeURIComponent(id)}&size=${size}`;
  return bust ? `${base}&t=${Date.now()}` : base;
}

/** Stream URL — track id required. */
export function streamUrl(track, codec) {
  if (!track?.id) return null;
  return `/api/stream?id=${encodeURIComponent(track.id)}&codec=${encodeURIComponent(codec)}`;
}

/**
 * GET /api/tracks/{id} → Track
 * @param {string} id
 * @returns {Promise<import("./models/track.js").Track>}
 */
export async function fetchTrack(id) {
  const raw = await apiGet(`/api/tracks/${encodeURIComponent(id)}`);
  return fromApiTrack(raw);
}

/**
 * POST /api/tracks/meta → Track[]
 * @param {string[]} ids
 * @returns {Promise<import("./models/track.js").Track[]>}
 */
export async function fetchTracksMeta(ids) {
  if (!ids?.length) return [];
  const data = await apiPost("/api/tracks/meta", { ids });
  return mapTracks(data.results || []);
}

/**
 * GET /api/albums/{id}/tracks → Track[]
 * @param {string} albumId
 */
export async function fetchAlbumTracks(albumId) {
  const data = await apiGet(
    `/api/albums/${encodeURIComponent(albumId)}/tracks`
  );
  return mapTracks(data.items || []);
}

/**
 * GET /api/playlists/{id}/tracks → Track[]
 * @param {string} playlistId
 */
export async function fetchPlaylistTracks(playlistId) {
  const data = await apiGet(
    `/api/playlists/${encodeURIComponent(playlistId)}/tracks`
  );
  return mapTracks(data.items || []);
}

/**
 * GET /api/search — maps tracks only; artists/albums stay server shape.
 * @param {string} q
 * @param {number} [limit]
 */
export async function fetchSearch(q, limit = 50) {
  const data = await apiGet(
    `/api/search?q=${encodeURIComponent(q)}&limit=${limit}`
  );
  return {
    artists: data.artists || [],
    albums: data.albums || [],
    tracks: mapTracks(data.tracks || []),
  };
}

/**
 * Collect file ids under path, then resolve full Track[] via meta.
 * @param {string} path
 * @returns {Promise<import("./models/track.js").Track[]>}
 */
export async function collectTracks(path) {
  const data = await apiGet(
    `/api/collect?path=${encodeURIComponent(path || "")}`
  );
  const ids = (data.files || []).map((f) => f.id).filter(Boolean);
  return fetchTracksMeta(ids);
}

/**
 * GET /api/artists/{id}/albums → album list (not tracks).
 * @param {string} artistId
 */
export async function fetchArtistAlbums(artistId) {
  const data = await apiGet(
    `/api/artists/${encodeURIComponent(artistId)}/albums`
  );
  return data.items || [];
}

/**
 * GET /api/artists/{id}
 * @param {string} artistId
 */
export async function fetchArtist(artistId) {
  return apiGet(`/api/artists/${encodeURIComponent(artistId)}`);
}

/**
 * GET /api/albums/{id}
 * @param {string} albumId
 */
export async function fetchAlbum(albumId) {
  return apiGet(`/api/albums/${encodeURIComponent(albumId)}`);
}

export function clearCache(...scopes) {
  const only = scopes.filter((s) => s === "streams");
  if (!only.length) return;
  const q = only.map((s) => `scope=${encodeURIComponent(s)}`).join("&");
  return fetch(`/api/cache/clear?${q}`, { method: "POST" }).catch(() => {});
}

/** Keys already prepared: "id|codec" */
export const preparedKeys = new Set();

/**
 * Prewarm by track ids (or track objects with .id).
 * @param {string[] | {id?: string}[]} tracksOrIds
 */
export function requestPrepare(tracksOrIds, codec, { replace = false } = {}) {
  const ids = [];
  for (const item of tracksOrIds || []) {
    if (typeof item === "string") ids.push(item);
    else if (item?.id) ids.push(item.id);
  }
  const fresh = ids.filter((id) => !preparedKeys.has(`${id}|${codec}`));
  if (!fresh.length && !replace) return;
  const use = replace ? ids : fresh;
  if (!use.length) return;
  use.forEach((id) => preparedKeys.add(`${id}|${codec}`));
  fetch("/api/transcode/prepare", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ids: use, codec, replace }),
  }).catch(() => {});
}

export {
  fromApiTrack,
  fromCatalogRecord,
  mapTracks,
  isTrack,
  coerceTrack,
} from "./models/track.js";
