/**
 * HTTP helpers + server-endpoint wrappers. Leaf module.
 */

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
 * Cover URL by album_id or track_id.
 * @param {{ albumId?: string, album_id?: string, trackId?: string, track_id?: string, id?: string }} ref
 * @param {'full'|'thumb'} size
 * @param {boolean} bust
 */
export function coverUrl(ref, size, bust = true) {
  if (!ref || typeof ref !== "object") {
    return "/static/img/placeholder.svg";
  }
  const albumId = ref.albumId || ref.album_id;
  const trackId = ref.trackId || ref.track_id || ref.id;
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

/** Stream URL — track id required. */
export function streamUrl(track, codec) {
  if (!track?.id) return null;
  return `/api/stream?id=${encodeURIComponent(track.id)}&codec=${encodeURIComponent(codec)}`;
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
