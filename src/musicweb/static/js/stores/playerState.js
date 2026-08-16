/**
 * Reactive player face + atomic play-source writers.
 * No playlist, sinks, or connectivity imports.
 */
import { reactive } from "vue";
import { PLACEHOLDER_COVER } from "../util.js";

/** @typedef {import('../playBlock.js').PlaySourceState} PlaySourceState */
/** @typedef {import('../playBlock.js').PlayBlockReason} PlayBlockReason */

export const player = reactive({
  seeking: false,
  /** Full now-playing open (mobile sheet / desktop right panel) */
  expanded: false,
  sheetOffset: 0,
  draggingSheet: false,
  volume: 1,
  currentTime: 0,
  duration: 0,
  paused: true,
  /**
   * Delivery source for the current load (not library path).
   * @type {PlaySourceState}
   */
  playSource: "none",
  /** Delivery profile tag actually used or intended (null when none). */
  playProfileId: null,
  /**
   * Machine reason when playSource is unavailable.
   * @type {PlayBlockReason | null}
   */
  playBlockReason: null,
  /** User-visible play block message (null when clear) */
  playNotice: null,
  /** Resolved cover URLs for PlayerBar (local OPFS or remote / placeholder). */
  coverThumb: PLACEHOLDER_COVER,
  coverFull: PLACEHOLDER_COVER,
  /** Expanded now-playing: lyrics overlay open */
  lyricsOpen: false,
});

/**
 * Atomic writer for the play-source triple (never leave a field stale).
 * @param {PlaySourceState} playSource
 * @param {string | null} playProfileId
 * @param {PlayBlockReason | null} playBlockReason
 */
export function setPlaySourceState(playSource, playProfileId, playBlockReason) {
  player.playSource = playSource;
  player.playProfileId = playProfileId || null;
  player.playBlockReason = playBlockReason || null;
}

export function clearPlaySourceState() {
  setPlaySourceState("none", null, null);
}

/** @param {string | null | undefined} msg */
export function setPlayNotice(msg) {
  player.playNotice = msg || null;
}
