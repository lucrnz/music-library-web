/**
 * Timestamp-free lyrics for the clipboard.
 */
import { parseLrc } from "@/lyrics/parseLrc";
import type { Lyrics } from "@/models/lyrics";

export function syncedLrcToPlainText(lrc: string): string {
  const out: string[] = [];
  for (const line of parseLrc(lrc)) {
    const text = line.text.trim();
    if (!text || text === "♪") continue;
    if (out.length && out[out.length - 1] === text) continue;
    out.push(text);
  }
  return out.join("\n");
}

export function lyricsClipboardText(payload: Lyrics): string | null {
  if (payload.instrumental || payload.status === "instrumental") return null;
  if (
    payload.status === "error" ||
    payload.status === "not_found" ||
    payload.status === "skipped" ||
    payload.status === "pending"
  ) {
    return null;
  }
  if (payload.syncedLrc) {
    const flat = syncedLrcToPlainText(payload.syncedLrc);
    if (flat) return flat;
  }
  const plain = payload.plainText?.trim();
  return plain || null;
}
