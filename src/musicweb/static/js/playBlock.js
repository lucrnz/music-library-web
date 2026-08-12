/**
 * Shared delivery play-block reasons and user-facing copy.
 * Used by resolve, player store, and playback status formatters.
 */

/**
 * Delivery source for the current player load (not library path).
 * @typedef {'none' | 'streaming' | 'downloaded' | 'unavailable'} PlaySourceState
 *
 * Machine reason when playback cannot start or failed.
 * @typedef {'missing' | 'broken' | 'no_id' | 'offline_no_local' | 'play_failed'} PlayBlockReason
 *
 * Resolve result type from resolvePlaySource (subset of PlaySourceState paths).
 * @typedef {'local' | 'remote' | 'unavailable'} ResolvePlayType
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
};

/**
 * @param {string | null | undefined} reason
 * @returns {string | null}
 */
export function playBlockMessage(reason) {
  if (!reason) return null;
  return PLAY_BLOCK_MESSAGES[/** @type {PlayBlockReason} */ (reason)] || null;
}
