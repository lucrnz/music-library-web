/**
 * Session-scoped expand state + lazy child cache for TreeView.
 * Not stored in ui.js.
 */
import { reactive } from "vue";
import type { TreeNode } from "@/components/tree/treeNode";

export type ChildStatus = "idle" | "loading" | "ready" | "error";

export interface ChildEntry {
  status: ChildStatus;
  children: TreeNode[];
  error: string;
}

export interface TreeSession {
  expanded: Record<string, boolean>;
  cache: Record<string, ChildEntry>;
  isExpanded: (key: string) => boolean;
  setExpanded: (key: string, on: boolean) => void;
  toggleExpanded: (key: string) => boolean;
  collapseAll: () => void;
  getEntry: (key: string) => ChildEntry;
  getChildren: (key: string) => TreeNode[];
  ensureChildren: (
    key: string,
    loader: () => Promise<TreeNode[]>,
  ) => Promise<TreeNode[]>;
  retryChildren: (
    key: string,
    loader: () => Promise<TreeNode[]>,
  ) => Promise<TreeNode[]>;
  primeChildren: (key: string, children: TreeNode[]) => void;
}

export function createTreeSession(): TreeSession {
  const expanded = reactive<Record<string, boolean>>({});
  const cache = reactive<Record<string, ChildEntry>>({});

  const inflight = new Map<string, Promise<TreeNode[]>>();

  function getEntry(key: string): ChildEntry {
    if (!cache[key]) {
      cache[key] = { status: "idle", children: [], error: "" };
    }
    return cache[key];
  }

  function isExpanded(key: string): boolean {
    return !!expanded[key];
  }

  function setExpanded(key: string, on: boolean): void {
    if (on) expanded[key] = true;
    else delete expanded[key];
  }

  function toggleExpanded(key: string): boolean {
    const next = !isExpanded(key);
    setExpanded(key, next);
    return next;
  }

  function collapseAll(): void {
    for (const k of Object.keys(expanded)) delete expanded[k];
  }

  function getChildren(key: string): TreeNode[] {
    return getEntry(key).children || [];
  }

  function primeChildren(key: string, children: TreeNode[]): void {
    const entry = getEntry(key);
    entry.status = "ready";
    entry.children = children || [];
    entry.error = "";
  }

  async function ensureChildren(
    key: string,
    loader: () => Promise<TreeNode[]>,
  ): Promise<TreeNode[]> {
    const entry = getEntry(key);
    if (entry.status === "ready") return entry.children;
    const existing = inflight.get(key);
    if (existing) return existing;

    entry.status = "loading";
    entry.error = "";
    const p = (async () => {
      try {
        const children = (await loader()) || [];
        entry.children = children;
        entry.status = "ready";
        entry.error = "";
        return children;
      } catch (err: unknown) {
        entry.status = "error";
        entry.error = err instanceof Error ? err.message : String(err);
        entry.children = [];
        throw err;
      } finally {
        inflight.delete(key);
      }
    })();
    inflight.set(key, p);
    return p;
  }

  async function retryChildren(
    key: string,
    loader: () => Promise<TreeNode[]>,
  ): Promise<TreeNode[]> {
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
const byScope = new Map<string, TreeSession>();

export function primePackedTree(session: TreeSession, roots: TreeNode[]): void {
  for (const ar of roots) {
    session.primeChildren(ar.key, ar.children || []);
    for (const al of ar.children || []) {
      session.primeChildren(al.key, al.children || []);
    }
  }
}

export function getTreeSession(scope: string): TreeSession {
  let s = byScope.get(scope);
  if (!s) {
    s = createTreeSession();
    byScope.set(scope, s);
  }
  return s;
}
