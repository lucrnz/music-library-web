/**
 * HTTP helpers + server-endpoint wrappers. Leaf module: imports nothing and
 * holds no UI or playlist state, so every other module may depend on it.
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
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => res.statusText);
    throw new Error(detail || res.statusText);
  }
  return res.json();
}

/** @param {string} path @param {'full'|'thumb'} size @param {boolean} bust cache-bust with a timestamp */
export function coverUrl(path, size, bust = true) {
  const base = `/api/cover?path=${encodeURIComponent(path)}&size=${size}`;
  return bust ? `${base}&t=${Date.now()}` : base;
}

/**
 * Wipe process-cache subtrees. Pass one or more of "streams", "covers".
 * Fire-and-forget; errors are ignored (same as playlist clear).
 */
export function clearCache(...scopes) {
  if (!scopes.length) return;
  const q = scopes.map((s) => `scope=${encodeURIComponent(s)}`).join("&");
  return fetch(`/api/cache/clear?${q}`, { method: "POST" }).catch(() => {});
}

/** "path|codec" pairs already sent to /api/transcode/prepare this session. */
export const preparedKeys = new Set();

/**
 * Fire-and-forget prewarm: ask the server to background-transcode paths
 * with the given codec. Playback never depends on this — /api/stream
 * transcodes on demand and preempts this queue.
 */
export function requestPrepare(paths, codec, { replace = false } = {}) {
  const fresh = paths.filter((p) => !preparedKeys.has(`${p}|${codec}`));
  if (!fresh.length && !replace) return;
  const wanted = replace ? paths : fresh;
  if (!wanted.length) return;
  wanted.forEach((p) => preparedKeys.add(`${p}|${codec}`));
  fetch("/api/transcode/prepare", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ paths: wanted, codec, replace }),
  }).catch(() => {});
}
