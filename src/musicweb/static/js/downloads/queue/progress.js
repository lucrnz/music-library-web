/**
 * Memory-first live progress; throttled IDB persistence.
 */

import { getOne, putOne } from "../db.js";
import { emitProgress } from "./events.js";

const IDB_PERSIST_MS = 1500;
const UI_EMIT_MS = 200;

/** @type {Map<number, { loaded: number, total: number|null }>} */
const live = new Map();

/** @type {Map<number, ReturnType<typeof setTimeout>>} */
const persistTimers = new Map();

/** @type {Map<number, number>} */
const lastUiEmit = new Map();

/**
 * @param {number} id
 */
export function getLiveProgress(id) {
  return live.get(id) || null;
}

export function getAllLiveProgress() {
  /** @type {Record<number, { loaded: number, total: number|null }>} */
  const out = {};
  for (const [id, v] of live) out[id] = v;
  return out;
}

/**
 * @param {number} id
 * @param {number} loaded
 * @param {number|null} total
 * @param {{ forceUi?: boolean, persistNow?: boolean }} [opts]
 */
export function updateLiveProgress(id, loaded, total, opts = {}) {
  live.set(id, { loaded, total });
  const now = Date.now();
  const last = lastUiEmit.get(id) || 0;
  if (opts.forceUi || now - last >= UI_EMIT_MS || loaded === total) {
    lastUiEmit.set(id, now);
    emitProgress(id, loaded, total);
  }
  if (opts.persistNow) {
    flushProgressToIdb(id).catch(() => {});
  } else {
    schedulePersist(id);
  }
}

/**
 * @param {number} id
 */
function schedulePersist(id) {
  if (persistTimers.has(id)) return;
  const t = setTimeout(() => {
    persistTimers.delete(id);
    flushProgressToIdb(id).catch(() => {});
  }, IDB_PERSIST_MS);
  persistTimers.set(id, t);
}

/**
 * @param {number} id
 */
export async function flushProgressToIdb(id) {
  const p = live.get(id);
  if (!p) return;
  const existing = persistTimers.get(id);
  if (existing) {
    clearTimeout(existing);
    persistTimers.delete(id);
  }
  try {
    const cur = await getOne("queue", id);
    if (!cur || cur.state === "canceled") return;
    cur.loaded = p.loaded;
    cur.total = p.total;
    await putOne("queue", cur);
  } catch {
    /* ignore */
  }
}

/**
 * @param {number} id
 */
export function clearLiveProgress(id) {
  live.delete(id);
  lastUiEmit.delete(id);
  const t = persistTimers.get(id);
  if (t) {
    clearTimeout(t);
    persistTimers.delete(id);
  }
}

/**
 * Seed from IDB row after list.
 * @param {number} id
 * @param {number} loaded
 * @param {number|null} total
 */
export function seedLiveProgress(id, loaded, total) {
  if (loaded || total) {
    live.set(id, { loaded: loaded || 0, total: total ?? null });
  }
}
