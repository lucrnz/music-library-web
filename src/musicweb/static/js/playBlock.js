/**
 * Shared delivery play-block reasons and user-facing copy.
 * Used by resolve, player store, and playback status formatters.
 */

/**
 * Delivery source for the current player load and resolvePlaySource results
 * (not library path). `none` is player-idle only; resolve never returns it.
 * @typedef {'none' | 'streaming' | 'downloaded' | 'unavailable'} PlaySourceState
 *
 * Machine reason when playback cannot start or failed.
 * @typedef {'missing' | 'broken' | 'no_id' | 'offline_no_local' | 'play_failed' | 'exclusive_needs_device' | 'exclusive_not_ready' | 'exclusive_readonly' | 'exclusive_failed' | 'exclusive_no_format'} PlayBlockReason
 */

/**
 * User-facing messages for play block reasons.
 * @type {Record<PlayBlockReason, string>}
 */
export const PLAY_BLOCK_MESSAGES = {
  missing: "Not downloaded for offline play. Download it while online.",
  broken: "Local file is unreadable. Re-download when online.",
  no_id: "Track has no id.",
  offline_no_local: "You're offline and this track isn't downloaded.",
  play_failed: "Playback failed",
  exclusive_needs_device:
    "Select an output device for exclusive audio.",
  exclusive_not_ready:
    "Exclusive companion is not ready (start companion, check token).",
  exclusive_readonly:
    "Exclusive audio is controlled in another tab or window.",
  exclusive_failed: "Exclusive playback stopped.",
  exclusive_no_format: "No supported exclusive format for this device.",
};

/**
 * @param {string | null | undefined} reason
 * @returns {string | null}
 */
export function playBlockMessage(reason) {
  if (!reason) return null;
  return PLAY_BLOCK_MESSAGES[/** @type {PlayBlockReason} */ (reason)] || null;
}
