/**
 * HTTP helpers + named track/library fetchers.
 * Track-bearing responses are normalized here — leaves do not call bare
 * apiGet for track lists.
 */

import { diagRequestHeaders } from "./diag/log.js";
import { fromApiAlbum, mapAlbums } from "./models/album.js";
import { fromApiLyrics } from "./models/lyrics.js";
import { fromApiTrack, mapTracks } from "./models/track.js";

function apiFetch(url, init = {}) {
  const headers = { ...diagRequestHeaders(), ...(init.headers || {}) };
  return fetch(url, { ...init, headers });
}

export async function apiGet(url) {
  const res = await apiFetch(url);
  if (!res.ok) {
    const detail = await res.text().catch(() => res.statusText);
    throw new Error(detail || res.statusText);
  }
  return res.json();
}

export async function apiPost(url, body) {
  const res = await apiFetch(url, {
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
  const res = await apiFetch(url, {
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
  const res = await apiFetch(url, {
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
  const res = await apiFetch(url, { method: "DELETE" });
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
 * GET /api/tracks/{id}/lyrics — normalized camelCase Lyrics.
 * @param {string} trackId
 * @returns {Promise<import("./models/lyrics.js").Lyrics>}
 */
export async function fetchLyrics(trackId) {
  const raw = await apiGet(`/api/tracks/${encodeURIComponent(trackId)}/lyrics`);
  return fromApiLyrics(raw);
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
 * GET /api/search — maps tracks and albums; artists stay server shape.
 * @param {string} q
 * @param {number} [limit]
 */
export async function fetchSearch(q, limit = 50) {
  const data = await apiGet(
    `/api/search?q=${encodeURIComponent(q)}&limit=${limit}`
  );
  return {
    artists: data.artists || [],
    albums: mapAlbums(data.albums || []),
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
  return mapAlbums(data.items || []);
}

/**
 * GET /api/albums — album list (not tracks).
 * @param {string} [query]
 */
export async function fetchAlbums(query = "limit=500&sort=title") {
  const data = await apiGet(`/api/albums?${query}`);
  return mapAlbums(data.items || []);
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
  return fromApiAlbum(
    await apiGet(`/api/albums/${encodeURIComponent(albumId)}`)
  );
}

export function clearCache(...scopes) {
  const only = scopes.filter((s) => s === "streams");
  if (!only.length) return;
  const q = only.map((s) => `scope=${encodeURIComponent(s)}`).join("&");
  return apiFetch(`/api/cache/clear?${q}`, { method: "POST" }).catch(() => {});
}

/** Keys already prepared: "id|codec" */
export const preparedKeys = new Set();

/**
 * Prewarm by track ids (or track objects with .id).
 * @param {string[] | {id?: string}[]} tracksOrIds
 * @param {string} codec
 * @param {{ replace?: boolean, urgent?: boolean }} [opts]
 *   urgent: near-end / play-priority prepare. Always POSTs (even if already
 *   in preparedKeys) so a pending prewarm job can be promoted server-side.
 */
export function requestPrepare(
  tracksOrIds,
  codec,
  { replace = false, urgent = false } = {}
) {
  const ids = [];
  for (const item of tracksOrIds || []) {
    if (typeof item === "string") ids.push(item);
    else if (item?.id) ids.push(item.id);
  }
  let use;
  if (urgent) {
    use = ids;
  } else {
    const fresh = ids.filter((id) => !preparedKeys.has(`${id}|${codec}`));
    if (!fresh.length && !replace) return;
    use = replace ? ids : fresh;
  }
  if (!use.length) return;
  use.forEach((id) => preparedKeys.add(`${id}|${codec}`));
  apiFetch("/api/transcode/prepare", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ids: use, codec, replace, urgent: !!urgent }),
  }).catch(() => {});
}

export { fromApiAlbum, mapAlbums } from "./models/album.js";
export {
  fromApiTrack,
  fromCatalogRecord,
  mapTracks,
  isTrack,
  coerceTrack,
} from "./models/track.js";
