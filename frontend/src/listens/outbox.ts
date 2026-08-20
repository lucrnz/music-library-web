/** localStorage pending listens. Last write wins; thrown writes are drops. */

export const LISTENS_PENDING_KEY = "musicweb.listens.pending.v1";

export interface PendingListen {
  id: string;
  track_id: string;
  profile: string;
  play_source: "streaming" | "downloaded";
  counted_at: string;
}

function isPending(value: unknown): value is PendingListen {
  if (!value || typeof value !== "object") return false;
  const rec = value as Record<string, unknown>;
  return (
    typeof rec.id === "string" &&
    rec.id.length > 0 &&
    typeof rec.track_id === "string" &&
    rec.track_id.length > 0 &&
    typeof rec.profile === "string" &&
    rec.profile.length > 0 &&
    (rec.play_source === "streaming" || rec.play_source === "downloaded") &&
    typeof rec.counted_at === "string" &&
    rec.counted_at.length > 0
  );
}

export function readPendingListens(): PendingListen[] {
  try {
    const raw = localStorage.getItem(LISTENS_PENDING_KEY);
    if (raw == null) return [];
    const data: unknown = JSON.parse(raw);
    if (!Array.isArray(data)) return [];
    return data.filter(isPending);
  } catch {
    return [];
  }
}

function writePendingListens(items: PendingListen[]): boolean {
  try {
    localStorage.setItem(LISTENS_PENDING_KEY, JSON.stringify(items));
    return true;
  } catch {
    return false;
  }
}

export function enqueuePending(item: PendingListen): boolean {
  const items = readPendingListens();
  items.push(item);
  return writePendingListens(items);
}

export function removePending(id: string): void {
  writePendingListens(readPendingListens().filter((item) => item.id !== id));
}
