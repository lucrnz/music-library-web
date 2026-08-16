/**
 * Session-scoped expand state + lazy child cache for TreeView.
 * Not stored in ui.js.
 */
import { reactive } from "vue";

/**
 * @typedef {'idle'|'loading'|'ready'|'error'} ChildStatus
 * @typedef {{ status: ChildStatus, children: object[], error: string }} ChildEntry
 */

/**
 * @returns {{
 *   expanded: Record<string, boolean>,
 *   cache: Record<string, ChildEntry>,
 *   isExpanded: (key: string) => boolean,
 *   setExpanded: (key: string, on: boolean) => void,
 *   toggleExpanded: (key: string) => boolean,
 *   collapseAll: () => void,
 *   getEntry: (key: string) => ChildEntry,
 *   getChildren: (key: string) => object[],
 *   ensureChildren: (key: string, loader: () => Promise<object[]>) => Promise<object[]>,
 *   retryChildren: (key: string, loader: () => Promise<object[]>) => Promise<object[]>,
 *   primeChildren: (key: string, children: object[]) => void,
 * }}
 */
export function createTreeSession() {
  const expanded = reactive(/** @type {Record<string, boolean>} */ ({}));
  const cache = reactive(/** @type {Record<string, ChildEntry>} */ ({}));

  /** @type {Map<string, Promise<object[]>>} */
  const inflight = new Map();

  function getEntry(key) {
    if (!cache[key]) {
      cache[key] = { status: "idle", children: [], error: "" };
    }
    return cache[key];
  }

  function isExpanded(key) {
    return !!expanded[key];
  }

  function setExpanded(key, on) {
    if (on) expanded[key] = true;
    else delete expanded[key];
  }

  function toggleExpanded(key) {
    const next = !isExpanded(key);
    setExpanded(key, next);
    return next;
  }

  function collapseAll() {
    for (const k of Object.keys(expanded)) delete expanded[k];
  }

  function getChildren(key) {
    return getEntry(key).children || [];
  }

  function primeChildren(key, children) {
    const entry = getEntry(key);
    entry.status = "ready";
    entry.children = children || [];
    entry.error = "";
  }

  /**
   * @param {string} key
   * @param {() => Promise<object[]>} loader
   */
  async function ensureChildren(key, loader) {
    const entry = getEntry(key);
    if (entry.status === "ready") return entry.children;
    if (inflight.has(key)) return inflight.get(key);

    entry.status = "loading";
    entry.error = "";
    const p = (async () => {
      try {
        const children = (await loader()) || [];
        entry.children = children;
        entry.status = "ready";
        entry.error = "";
        return children;
      } catch (err) {
        entry.status = "error";
        entry.error = err?.message || String(err);
        entry.children = [];
        throw err;
      } finally {
        inflight.delete(key);
      }
    })();
    inflight.set(key, p);
    return p;
  }

  /**
   * @param {string} key
   * @param {() => Promise<object[]>} loader
   */
  async function retryChildren(key, loader) {
    const entry = getEntry(key);
    entry.status = "idle";
    entry.error = "";
    entry.children = [];
    inflight.delete(key);
    return ensureChildren(key, loader);
  }

  return {
    expanded,
    cache,
    isExpanded,
    setExpanded,
    toggleExpanded,
    collapseAll,
    getEntry,
    getChildren,
    ensureChildren,
    retryChildren,
    primeChildren,
  };
}

/** @type {Map<string, ReturnType<typeof createTreeSession>>} */
const byScope = new Map();

/**
 * @param {string} scope
 */
export function getTreeSession(scope) {
  let s = byScope.get(scope);
  if (!s) {
    s = createTreeSession();
    byScope.set(scope, s);
  }
  return s;
}
