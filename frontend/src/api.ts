/**
 * HTTP helpers + named track/library fetchers.
 * Track-bearing responses are normalized here — leaves do not call bare
 * apiGet for track lists.
 */

import { reportFailure, reportSuccess } from "@/connectivity";
import { diagRequestHeaders } from "@/diag/log";
import { fromApiAlbum, mapAlbums, type Album } from "@/models/album";
import { fromApiArtist, mapArtists, type Artist } from "@/models/artist";
import { fromApiLyrics, type Lyrics } from "@/models/lyrics";
import { fromApiTrack, mapTracks, type Track } from "@/models/track";

export interface ItemsResponse<T> {
  items?: T[];
  results?: T[];
  artists?: T[];
  albums?: unknown[];
  tracks?: unknown[];
}

export async function apiFetch(url: string, init: RequestInit = {}): Promise<Response> {
  const headers = { ...diagRequestHeaders(), ...(init.headers || {}) };
  let res: Response;
  try {
    res = await fetch(url, { ...init, headers });
  } catch (err) {
    reportFailure(err);
    throw err;
  }
  if (res.ok) {
    reportSuccess();
  } else if (res.status === 429 || res.status >= 500) {
    reportFailure(null, res.status);
  }
  return res;
}

export async function apiGet<T>(url: string, init: RequestInit = {}): Promise<T> {
  const res = await apiFetch(url, init);
  if (!res.ok) {
    const detail = await res.text().catch(() => res.statusText);
    throw new Error(detail || res.statusText);
  }
  return (await res.json()) as T;
}

export async function apiPost<T>(url: string, body?: unknown): Promise<T> {
  const res = await apiFetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => res.statusText);
    throw new Error(detail || res.statusText);
  }
  return (await res.json()) as T;
}

export async function apiPut<T>(url: string, body?: unknown): Promise<T> {
  const res = await apiFetch(url, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => res.statusText);
    throw new Error(detail || res.statusText);
  }
  return (await res.json()) as T;
}

export async function apiPatch<T>(url: string, body?: unknown): Promise<T> {
  const res = await apiFetch(url, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => res.statusText);
    throw new Error(detail || res.statusText);
  }
  return (await res.json()) as T;
}

export async function apiDelete<T = Record<string, never>>(url: string): Promise<T> {
  const res = await apiFetch(url, { method: "DELETE" });
  if (!res.ok) {
    const detail = await res.text().catch(() => res.statusText);
    throw new Error(detail || res.statusText);
  }
  return (await res.json().catch(() => ({}))) as T;
}

/**
 * Cover URL for a Track (or album-only ref).
 * Query params stay snake_case for the HTTP API.
 */
export function coverUrl(
  ref: { albumId?: string | null; id?: string | null } | null | undefined,
  size: "full" | "thumb",
  bust = true,
): string {
  if (!ref || typeof ref !== "object") {
    return "/static/img/placeholder.svg";
  }
  const albumId = ref.albumId || null;
  const trackId = ref.id || null;
  let base: string;
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
 */
export function artistImageUrl(
  artistOrId:
    | string
    | { id?: string; preferredRev?: number; hasPreferredImage?: boolean }
    | null
    | undefined,
  size: "full" | "thumb" = "thumb",
  bust = false,
): string {
  const id =
    typeof artistOrId === "string"
      ? artistOrId
      : artistOrId && typeof artistOrId === "object"
        ? artistOrId.id
        : null;
  if (!id) return "/static/img/placeholder.svg";
  const rev =
    typeof artistOrId === "object" &&
    artistOrId &&
    typeof artistOrId.preferredRev === "number" &&
    artistOrId.preferredRev !== 0
      ? artistOrId.preferredRev
      : 0;
  let url = `/api/artist-image?artist_id=${encodeURIComponent(id)}&size=${size}`;
  if (rev) url += `&rev=${rev}`;
  if (bust) url += `&t=${Date.now()}`;
  return url;
}

/** GET /api/radio/now — raw station snapshot (normalize in the radio store). */
export function fetchRadioNow(): Promise<unknown> {
  return apiGet("/api/radio/now");
}

/** Stream URL — track id required. */
export function streamUrl(
  track: { id?: string } | null | undefined,
  codec: string,
): string | null {
  if (!track?.id) return null;
  return `/api/stream?id=${encodeURIComponent(track.id)}&codec=${encodeURIComponent(codec)}`;
}

/** GET /api/tracks/{id} → Track */
export async function fetchTrack(id: string): Promise<Track> {
  const raw = await apiGet<unknown>(`/api/tracks/${encodeURIComponent(id)}`);
  return fromApiTrack(raw);
}

/** GET /api/tracks/{id}/lyrics — normalized camelCase Lyrics. */
export async function fetchLyrics(trackId: string): Promise<Lyrics> {
  const raw = await apiGet<unknown>(
    `/api/tracks/${encodeURIComponent(trackId)}/lyrics`,
  );
  return fromApiLyrics(raw);
}

/** POST /api/cd/lyrics — LRCLIB by tags; never 404 for not found. */
export async function fetchCdromLyrics(body: {
  title?: string | null;
  artist?: string | null;
  album?: string | null;
  duration_ms?: number | null;
}): Promise<Lyrics> {
  const raw = await apiPost<unknown>("/api/cd/lyrics", {
    title: body.title || "",
    artist: body.artist || "",
    album: body.album || "",
    duration_ms: body.duration_ms ?? null,
  });
  return fromApiLyrics(raw);
}

/** POST /api/tracks/meta → Track[] */
export async function fetchTracksMeta(ids: string[]): Promise<Track[]> {
  if (!ids?.length) return [];
  const data = await apiPost<ItemsResponse<unknown>>("/api/tracks/meta", { ids });
  return mapTracks(data.results || []);
}

/** GET /api/albums/{id}/tracks → Track[] */
export async function fetchAlbumTracks(albumId: string): Promise<Track[]> {
  const data = await apiGet<ItemsResponse<unknown>>(
    `/api/albums/${encodeURIComponent(albumId)}/tracks`,
  );
  return mapTracks(data.items || []);
}

/** GET /api/playlists/{id}/tracks → Track[] */
export async function fetchPlaylistTracks(playlistId: string): Promise<Track[]> {
  const data = await apiGet<ItemsResponse<unknown>>(
    `/api/playlists/${encodeURIComponent(playlistId)}/tracks`,
  );
  return mapTracks(data.items || []);
}

export interface SearchResult {
  artists: Artist[];
  albums: Album[];
  tracks: Track[];
}

/** GET /api/search — maps artists, albums, and tracks. */
export async function fetchSearch(q: string, limit = 50): Promise<SearchResult> {
  const data = await apiGet<ItemsResponse<unknown>>(
    `/api/search?q=${encodeURIComponent(q)}&limit=${limit}`,
  );
  return {
    artists: mapArtists(data.artists || []),
    albums: mapAlbums(data.albums || []),
    tracks: mapTracks(data.tracks || []),
  };
}

/** GET /api/artists/{id}/albums → album list (not tracks). */
export async function fetchArtistAlbums(artistId: string): Promise<Album[]> {
  const data = await apiGet<ItemsResponse<unknown>>(
    `/api/artists/${encodeURIComponent(artistId)}/albums`,
  );
  return mapAlbums(data.items || []);
}

/** GET /api/albums — album list (not tracks). */
export async function fetchAlbums(
  query = "limit=500&sort=title",
): Promise<Album[]> {
  const data = await apiGet<ItemsResponse<unknown>>(`/api/albums?${query}`);
  return mapAlbums(data.items || []);
}

/** GET /api/artists — mapped Artist[]. */
export async function fetchArtists(
  query = "limit=500",
): Promise<Artist[]> {
  const data = await apiGet<ItemsResponse<unknown>>(`/api/artists?${query}`);
  return mapArtists(data.items || []);
}

/** GET /api/artists/{id} */
export async function fetchArtist(artistId: string): Promise<Artist> {
  return fromApiArtist(
    await apiGet<unknown>(`/api/artists/${encodeURIComponent(artistId)}`),
  );
}

/** GET /api/albums/{id} */
export async function fetchAlbum(albumId: string): Promise<Album> {
  return fromApiAlbum(
    await apiGet<unknown>(`/api/albums/${encodeURIComponent(albumId)}`),
  );
}

export async function identifyCd(
  toc: import("@/cd/types").CdTocPayload,
  cdText: import("@/cd/types").CdTextPayload | null,
  opts?: { force?: boolean },
): Promise<import("@/cd/types").CdIdentifyResponse> {
  return apiPost("/api/cd/identify", {
    toc,
    cd_text: cdText,
    force: !!opts?.force,
  });
}

export async function confirmCd(
  discid: string,
  releaseMbid: string,
  toc: import("@/cd/types").CdTocPayload,
): Promise<import("@/cd/types").CdApplied> {
  return apiPost("/api/cd/confirm", {
    discid,
    release_mbid: releaseMbid,
    toc,
  });
}

export async function getCdIdentity(
  discid: string,
): Promise<import("@/cd/types").CdApplied> {
  return apiGet(`/api/cd/identities/${encodeURIComponent(discid)}`);
}

export { fromApiAlbum, mapAlbums } from "@/models/album";
export { fromApiArtist, mapArtists, type Artist } from "@/models/artist";
export {
  fromApiTrack,
  fromCatalogRecord,
  mapTracks,
  isTrack,
  coerceTrack,
} from "@/models/track";
