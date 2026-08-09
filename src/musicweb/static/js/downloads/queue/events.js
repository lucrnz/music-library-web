/**
 * Queue change / progress pub-sub (no Vue).
 */

/** @type {Set<() => void>} */
const changeListeners = new Set();
/** @type {Set<(id: number, loaded: number, total: number|null) => void>} */
const progressListeners = new Set();

export function onQueueChange(fn) {
  changeListeners.add(fn);
  return () => changeListeners.delete(fn);
}

export function emitQueueChange() {
  for (const fn of changeListeners) {
    try {
      fn();
    } catch (err) {
      console.error(err);
    }
  }
}

/**
 * @param {(id: number, loaded: number, total: number|null) => void} fn
 */
export function onProgressChange(fn) {
  progressListeners.add(fn);
  return () => progressListeners.delete(fn);
}

/**
 * @param {number} id
 * @param {number} loaded
 * @param {number|null} total
 */
export function emitProgress(id, loaded, total) {
  for (const fn of progressListeners) {
    try {
      fn(id, loaded, total);
    } catch (err) {
      console.error(err);
    }
  }
}
