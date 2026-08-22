/**
 * Shared delivery play-block reasons and user-facing copy.
 * Used by resolve, player store, and playback status formatters.
 */

import { isLocallyPlayableDownload } from "@/downloads/catalog";

/**
 * Delivery source for the current player load and resolvePlaySource results
 * (not library path). `none` is player-idle only; resolve never returns it.
 */
export type PlaySourceState =
  | "none"
  | "streaming"
  | "downloaded"
  | "unavailable";

/** Machine reason when playback cannot start or failed. */
export type PlayBlockReason =
  | "missing"
  | "broken"
  | "no_id"
  | "offline_no_local"
  | "play_failed"
  | "codec_unsupported"
  | "exclusive_needs_device"
  | "exclusive_not_ready"
  | "exclusive_readonly"
  | "exclusive_failed"
  | "exclusive_no_format"
  | "exclusive_lossy";

/** User-facing messages for play block reasons. */
export const PLAY_BLOCK_MESSAGES: Record<PlayBlockReason, string> = {
  missing: "Not downloaded for offline play. Download it while online.",
  broken: "Local file is unreadable. Re-download when online.",
  no_id: "Track has no id.",
  offline_no_local: "You're offline and this track isn't downloaded.",
  play_failed: "Playback failed",
  exclusive_needs_device: "Select an output device for exclusive audio.",
  exclusive_not_ready:
    "Exclusive companion is not ready (start companion, check token).",
  exclusive_readonly:
    "Exclusive audio is controlled in another tab or window.",
  exclusive_failed: "Exclusive playback stopped.",
  exclusive_no_format: "No supported exclusive format for this device.",
  exclusive_lossy: "Exclusive playback does not support lossy sources yet.",
  codec_unsupported: "This browser cannot decode this file.",
};

export function playBlockMessage(
  reason: string | null | undefined,
): string | null {
  if (!reason) return null;
  return (PLAY_BLOCK_MESSAGES as Record<string, string | undefined>)[reason] || null;
}

export function isPlayBlockReason(
  value: string | null | undefined,
): value is PlayBlockReason {
  return !!value && value in PLAY_BLOCK_MESSAGES;
}

/** Sink/load failure. `reason` is the play-block; message defaults to the copy table. */
export class PlayBlockError extends Error {
  readonly reason: PlayBlockReason;

  constructor(reason: PlayBlockReason, message?: string) {
    super(message || PLAY_BLOCK_MESSAGES[reason]);
    this.name = "PlayBlockError";
    this.reason = reason;
  }
}

function messageFromUnknown(err: unknown): string | undefined {
  if (err instanceof Error && err.message) return err.message;
  if (err == null) return undefined;
  const text = String(err);
  return text || undefined;
}

/** Identity on `PlayBlockError`; otherwise wrap with *fallback*. */
export function toPlayBlockError(
  err: unknown,
  fallback: PlayBlockReason,
): PlayBlockError {
  if (err instanceof PlayBlockError) return err;
  return new PlayBlockError(fallback, messageFromUnknown(err));
}

/** Queue row / skip gate: downloads on, remote unusable, no local playable file. */
export function isOfflineUnplayable(
  trackId: string | null | undefined,
  opts: { downloadsEnabled: boolean; canUseRemote: boolean },
): boolean {
  return (
    opts.downloadsEnabled &&
    !opts.canUseRemote &&
    !isLocallyPlayableDownload(trackId ?? "")
  );
}
