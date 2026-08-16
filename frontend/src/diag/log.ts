/**
 * Client diagnostic logger: cutoff, cookies, outbox, flush.
 */

import { reactive } from "vue";
import { outboxAll, outboxDelete, outboxPut } from "@/diag/idb";

const KEY_CLIENT = "musicweb.diag.clientId";
const KEY_SESSION = "musicweb.diag.sessionId";
const KEY_MODE = "musicweb.diag.mode";

const COOKIE_CLIENT = "musicweb_client";
const COOKIE_SESSION = "musicweb_session";
const COOKIE_PLAY = "musicweb_play";
const COOKIE_MODE = "musicweb_mode";

const OUTBOX_MAX = 500;
const BATCH = 100;

export type DiagMode = "errors" | "everything";
export type DiagLevel = "info" | "warn" | "error";

export interface DiagRecord {
  id?: number;
  event: string;
  level: DiagLevel;
  ts: string;
  client_id: string | null;
  session_id: string | null;
  play_id: string | null;
  data: object;
}

export interface DiagIngestEvent {
  event: string;
  level: DiagLevel;
  ts: string;
  client_id: string | null;
  session_id: string | null;
  play_id: string | null;
  data: object;
}

export const DIAG_MODES = [
  { id: "errors" as const, label: "Errors only" },
  { id: "everything" as const, label: "Everything" },
];

export const diag = reactive({
  clientId: "",
  sessionId: null as string | null,
  mode: "errors" as DiagMode,
  playId: null as string | null,
});

/** Memory source of truth; IDB is a persist mirror */
const unacked: DiagRecord[] = [];

let hydratePromise: Promise<void> | null = null;

let flushTimer: ReturnType<typeof setTimeout> | 0 = 0;
let flushing = false;
let hideBound = false;

function newId(): string {
  try {
    if (typeof globalThis.crypto?.randomUUID === "function") {
      return crypto.randomUUID();
    }
  } catch {
    /* ignore */
  }
  return `${Date.now().toString(16)}-${Math.random().toString(16).slice(2)}`;
}

function lsGet(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function lsSet(key: string, value: string | null): void {
  try {
    if (value == null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    /* ignore */
  }
}

function cookieSuffix(): string {
  const secure = location.protocol === "https:" ? "; Secure" : "";
  return `; Path=/api; SameSite=Lax${secure}`;
}

function setCookie(name: string, value: string): void {
  if (typeof document === "undefined") return;
  document.cookie = `${name}=${encodeURIComponent(value)}${cookieSuffix()}`;
}

function clearCookie(name: string): void {
  if (typeof document === "undefined") return;
  document.cookie = `${name}=; Max-Age=0${cookieSuffix()}`;
}

function utcTs(): string {
  return new Date().toISOString();
}

function writeCookies(): void {
  if (diag.clientId) setCookie(COOKIE_CLIENT, diag.clientId);
  setCookie(COOKIE_MODE, diag.mode);
  if (diag.sessionId) setCookie(COOKIE_SESSION, diag.sessionId);
  else clearCookie(COOKIE_SESSION);
  if (diag.playId) setCookie(COOKIE_PLAY, diag.playId);
  else clearCookie(COOKIE_PLAY);
}

/**
 * Headers for same-origin API fetch helpers. Omit null ids; always send mode.
 */
export function diagRequestHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    "X-Musicweb-Mode": diag.mode === "everything" ? "everything" : "errors",
  };
  if (diag.clientId) headers["X-Musicweb-Client"] = diag.clientId;
  if (diag.sessionId) headers["X-Musicweb-Session"] = diag.sessionId;
  if (diag.playId) headers["X-Musicweb-Play"] = diag.playId;
  return headers;
}

export function setMode(next: DiagMode): void {
  const mode = next === "everything" ? "everything" : "errors";
  diag.mode = mode;
  lsSet(KEY_MODE, mode);
  if (mode === "everything") {
    if (!diag.sessionId) {
      diag.sessionId = newId();
      lsSet(KEY_SESSION, diag.sessionId);
    }
  } else {
    diag.sessionId = null;
    lsSet(KEY_SESSION, null);
  }
  writeCookies();
}

export function beginPlay(): string {
  const id = newId();
  diag.playId = id;
  writeCookies();
  return id;
}

function acceptsLevel(level: DiagLevel): boolean {
  if (level === "error") return true;
  return diag.mode === "everything";
}

function scheduleFlush(): void {
  if (flushTimer) return;
  flushTimer = setTimeout(() => {
    flushTimer = 0;
    flushOutbox().catch(() => {});
  }, 50);
}

function toIngestEvent(row: DiagRecord): DiagIngestEvent {
  return {
    event: row.event,
    level: row.level,
    ts: row.ts,
    client_id: row.client_id ?? null,
    session_id: row.session_id ?? null,
    play_id: row.play_id ?? null,
    data: row.data && typeof row.data === "object" ? row.data : {},
  };
}

function dropIds(ids: Array<number | undefined>): Promise<void> {
  const nums = ids.filter((id): id is number => typeof id === "number");
  if (!nums.length) return Promise.resolve();
  return outboxDelete(nums).catch(() => {});
}

function dropRows(rows: DiagRecord[]): void {
  for (const row of rows) {
    const idx = unacked.indexOf(row);
    if (idx >= 0) unacked.splice(idx, 1);
  }
  dropIds(rows.map((r) => r.id));
}

async function postBatch(events: DiagIngestEvent[]): Promise<boolean> {
  const res = await fetch("/api/diag/events", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...diagRequestHeaders(),
    },
    body: JSON.stringify({ events }),
    keepalive: true,
  });
  return res.ok;
}

function ensureHydrated(): Promise<void> {
  if (!hydratePromise) {
    hydratePromise = outboxAll()
      .then((rows) => {
        if (Array.isArray(rows) && rows.length) {
          unacked.push(...(rows as DiagRecord[]));
        }
      })
      .catch(() => {});
  }
  return hydratePromise;
}

export async function flushOutbox(): Promise<void> {
  if (flushing) return;
  flushing = true;
  try {
    await ensureHydrated();
    while (unacked.length) {
      const chunk = unacked.slice(0, BATCH);
      const ok = await postBatch(chunk.map(toIngestEvent));
      if (!ok) return;
      dropRows(chunk);
    }
  } catch {
    /* leave rows in place */
  } finally {
    flushing = false;
  }
}

function beaconFlush(): void {
  const chunk = unacked.slice(0, BATCH);
  if (!chunk.length) return;
  if (typeof navigator === "undefined" || !navigator.sendBeacon) return;
  try {
    const body = JSON.stringify({
      events: chunk.map(toIngestEvent),
    });
    const blob = new Blob([body], { type: "application/json" });
    if (navigator.sendBeacon("/api/diag/events", blob)) {
      dropRows(chunk);
    }
  } catch {
    /* ignore */
  }
}

function bindHide(): void {
  if (hideBound || typeof document === "undefined") return;
  hideBound = true;
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") {
      flushOutbox().catch(() => {});
      beaconFlush();
    }
  });
  window.addEventListener("pagehide", () => {
    flushOutbox().catch(() => {});
    beaconFlush();
  });
}

async function persist(record: DiagRecord): Promise<void> {
  const id = await outboxPut(record);
  if (id != null) record.id = id;
  if (unacked.length > OUTBOX_MAX) {
    const dropped = unacked.splice(0, unacked.length - OUTBOX_MAX);
    await dropIds(dropped.map((r) => r.id));
  }
}

export function emit(
  event: string,
  data: object = {},
  level: DiagLevel = "info",
): void {
  try {
    const lvl: DiagLevel =
      level === "error" || level === "warn" ? level : "info";
    if (!acceptsLevel(lvl)) return;
    const record: DiagRecord = {
      event,
      level: lvl,
      ts: utcTs(),
      client_id: diag.clientId || null,
      session_id: diag.sessionId,
      play_id: diag.playId,
      data: data && typeof data === "object" ? data : {},
    };
    ensureHydrated()
      .then(() => {
        unacked.push(record);
        return persist(record);
      })
      .then(() => scheduleFlush())
      .catch(() => {
        if (!unacked.includes(record)) unacked.push(record);
        scheduleFlush();
      });
  } catch {
    /* never throw into callers */
  }
}

function displayMode(): "standalone" | "browser" {
  try {
    if (typeof window !== "undefined" && window.matchMedia) {
      if (window.matchMedia("(display-mode: standalone)").matches) {
        return "standalone";
      }
    }
  } catch {
    /* ignore */
  }
  return "browser";
}

export function initDiag(): void {
  let client = lsGet(KEY_CLIENT);
  if (!client) {
    client = newId();
    lsSet(KEY_CLIENT, client);
  }
  diag.clientId = client;
  const storedMode = lsGet(KEY_MODE);
  diag.mode = storedMode === "everything" ? "everything" : "errors";
  if (diag.mode === "everything") {
    diag.sessionId = lsGet(KEY_SESSION) || newId();
    lsSet(KEY_SESSION, diag.sessionId);
  } else {
    diag.sessionId = null;
    lsSet(KEY_SESSION, null);
  }
  writeCookies();
  bindHide();
  ensureHydrated()
    .then(() => {
      emit(
        "diag.boot",
        {
          ua: typeof navigator !== "undefined" ? navigator.userAgent : "",
          displayMode: displayMode(),
          standalone: displayMode() === "standalone",
          origin: typeof location !== "undefined" ? location.origin : "",
          isSecureContext:
            typeof window !== "undefined" ? !!window.isSecureContext : false,
        },
        "info",
      );
      flushOutbox().catch(() => {});
    })
    .catch(() => {});
}
