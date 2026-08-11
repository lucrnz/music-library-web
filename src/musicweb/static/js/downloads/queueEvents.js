/**
 * Queue change / progress event bus.
 * Mutation side effects (health + pump) are injected from queuePolicy.
 */

/** @type {Set<() => void>} */
const changeListeners = new Set();
/** @type {Set<(id: number, loaded: number, total: number|null) => void>} */
const progressListeners = new Set();

/** Coalesce side effects to one microtask after mutation emits. */
let afterMutationScheduled = false;
/** @type {null | (() => void | Promise<void>)} */
let afterMutationHook = null;

/**
 * Install health+pump hook (called once from initPolicy).
 * @param {() => void | Promise<void>} fn
 */
export function setQueueMutationSideEffects(fn) {
  afterMutationHook = fn;
}

export function onQueueChange(fn) {
  changeListeners.add(fn);
  return () => changeListeners.delete(fn);
}

/**
 * Notify UI listeners, then schedule shared side effects (health + pump).
 * Progress ticks must use emitProgress — not this.
 */
export function emitQueueChange() {
  for (const fn of changeListeners) {
    try {
      fn();
    } catch (err) {
      console.error(err);
    }
  }
  scheduleAfterQueueMutation();
}

function scheduleAfterQueueMutation() {
  if (afterMutationScheduled) return;
  afterMutationScheduled = true;
  queueMicrotask(() => {
    afterMutationScheduled = false;
    Promise.resolve()
      .then(() => (afterMutationHook ? afterMutationHook() : undefined))
      .catch(console.error);
  });
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
