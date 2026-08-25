/**
 * PWA client for companion blob WS + loopback file HTTP.
 */
import { exclusiveAudio } from "@/stores/exclusiveAudio";
import { onCompanionEvent, sendCompanion } from "@/exclusive/companionClient";
import {
  MSG_BLOB_ABORT,
  MSG_BLOB_DELETE,
  MSG_BLOB_DONE,
  MSG_BLOB_ERROR,
  MSG_BLOB_PROGRESS,
  MSG_BLOB_PUT,
  MSG_BLOB_STAT,
  MSG_BLOB_STAT_OK,
  MSG_DISK_INFO,
  MSG_DISK_INFO_OK,
  envelope,
} from "@/exclusive/protocol";

export function audioBlobKey(trackId: string, codec: string, ext: string): string {
  return `audio/${trackId}.${codec}.${ext}`;
}

export function albumArtBlobKey(albumId: string, size: string): string {
  return `covers/albums/${albumId}.${size}.webp`;
}

export function artistArtBlobKey(artistId: string, size: string): string {
  return `covers/artists/${artistId}.${size}.webp`;
}

export function fileUrl(key: string): string {
  const port = exclusiveAudio.port || 18765;
  const token = encodeURIComponent(exclusiveAudio.companionToken || "");
  const path = key
    .split("/")
    .map((p) => encodeURIComponent(p))
    .join("/");
  return `http://127.0.0.1:${port}/files/${path}?token=${token}`;
}

/** Loopback locker URL. Leftover OPFS `blob:` URLs are HTML-only. */
export function isCompanionFileUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return (
      parsed.protocol === "http:" &&
      parsed.hostname === "127.0.0.1" &&
      parsed.pathname.startsWith("/files/")
    );
  } catch {
    return false;
  }
}

const pending = new Map<
  string,
  {
    resolve: (v: { bytes: number }) => void;
    reject: (e: Error) => void;
    onProgress?: (loaded: number, total: number | null) => void;
  }
>();

const statWait = new Map<
  string,
  (v: { exists: boolean; bytes: number }) => void
>();
let diskWait: ((n: number) => void) | null = null;

let listening = false;

function ensureListen() {
  if (listening) return;
  listening = true;
  onCompanionEvent((evt) => {
    const rec = evt as {
      type?: string;
      requestId?: string;
      key?: string;
      loaded?: number;
      total?: number | null;
      bytes?: number;
      exists?: boolean;
      free?: number;
      code?: string;
      message?: string;
    };
    if (rec.type === MSG_BLOB_PROGRESS && rec.requestId) {
      pending.get(rec.requestId)?.onProgress?.(
        rec.loaded || 0,
        rec.total ?? null,
      );
      return;
    }
    if (rec.type === MSG_BLOB_DONE && rec.requestId) {
      const p = pending.get(rec.requestId);
      pending.delete(rec.requestId);
      p?.resolve({ bytes: rec.bytes || 0 });
      return;
    }
    if (rec.type === MSG_BLOB_ERROR && rec.requestId) {
      const p = pending.get(rec.requestId);
      pending.delete(rec.requestId);
      const err = new Error(rec.message || rec.code || "blob error");
      (err as { code?: string }).code = rec.code;
      p?.reject(err);
      return;
    }
    if (rec.type === MSG_BLOB_STAT_OK && rec.key) {
      const w = statWait.get(rec.key);
      statWait.delete(rec.key);
      w?.({ exists: !!rec.exists, bytes: rec.bytes || 0 });
      return;
    }
    if (rec.type === MSG_DISK_INFO_OK) {
      const w = diskWait;
      diskWait = null;
      w?.(typeof rec.free === "number" ? rec.free : 0);
    }
  });
}

export function putFromUrl(opts: {
  requestId: string;
  key: string;
  url: string;
  offset?: number;
  onProgress?: (loaded: number, total: number | null) => void;
}): Promise<{ bytes: number }> {
  ensureListen();
  return new Promise((resolve, reject) => {
    pending.set(opts.requestId, {
      resolve,
      reject,
      onProgress: opts.onProgress,
    });
    const ok = sendCompanion(
      envelope(MSG_BLOB_PUT, {
        requestId: opts.requestId,
        key: opts.key,
        url: opts.url,
        offset: opts.offset || 0,
      }),
    );
    if (!ok) {
      pending.delete(opts.requestId);
      reject(new Error("companion not connected"));
    }
  });
}

export function abortPut(requestId: string): void {
  sendCompanion(envelope(MSG_BLOB_ABORT, { requestId }));
  const p = pending.get(requestId);
  pending.delete(requestId);
  p?.reject(new Error("aborted"));
}

export function deleteKey(key: string): void {
  sendCompanion(envelope(MSG_BLOB_DELETE, { key }));
}

export function stat(key: string): Promise<{ exists: boolean; bytes: number }> {
  ensureListen();
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => {
      statWait.delete(key);
      reject(new Error("blob_stat timeout"));
    }, 4000);
    statWait.set(key, (v) => {
      clearTimeout(t);
      resolve(v);
    });
    if (!sendCompanion(envelope(MSG_BLOB_STAT, { key }))) {
      clearTimeout(t);
      statWait.delete(key);
      resolve({ exists: false, bytes: 0 });
    }
  });
}

export function diskFree(): Promise<number> {
  ensureListen();
  return new Promise((resolve) => {
    const t = setTimeout(() => {
      diskWait = null;
      resolve(0);
    }, 4000);
    diskWait = (n) => {
      clearTimeout(t);
      resolve(n);
    };
    if (!sendCompanion(envelope(MSG_DISK_INFO))) {
      clearTimeout(t);
      diskWait = null;
      resolve(0);
    }
  });
}

export async function putBytes(
  key: string,
  data: Blob | ArrayBuffer,
  signal?: AbortSignal,
): Promise<number> {
  const body = data instanceof Blob ? data : new Blob([data]);
  const res = await fetch(fileUrl(key), { method: "PUT", body, signal });
  if (!res.ok) throw new Error(`companion PUT ${res.status}`);
  const json = (await res.json().catch(() => ({}))) as { bytes?: number };
  return json.bytes ?? body.size;
}
