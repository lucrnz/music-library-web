/**
 * Reactive player face + atomic play-source writers.
 * No playlist, sinks, or connectivity imports.
 */
import { reactive } from "vue";
import type { PlayBlockReason, PlaySourceState } from "@/playBlock";
import { PLACEHOLDER_COVER } from "@/util";

/** Desktop-rail / mobile-sheet occupant. Mobile `/radio` ignores this. */
export type NowPlayingRail = "queue" | "radio" | "cd";

export interface PlayerState {
  seeking: boolean;
  expanded: boolean;
  railFace: NowPlayingRail;
  sheetOffset: number;
  draggingSheet: boolean;
  volume: number;
  currentTime: number;
  duration: number;
  paused: boolean;
  playSource: PlaySourceState;
  playProfileId: string | null;
  playBlockReason: PlayBlockReason | null;
  playNotice: string | null;
  coverThumb: string;
  coverFull: string;
  lyricsOpen: boolean;
  /** Queue playIndex/loadResolved in flight (Play button busy). */
  loadPending: boolean;
}

export const player = reactive<PlayerState>({
  seeking: false,
  /** Full now-playing open (mobile sheet / desktop right panel) */
  expanded: false,
  railFace: "queue",
  sheetOffset: 0,
  draggingSheet: false,
  volume: 1,
  currentTime: 0,
  duration: 0,
  paused: true,
  /** Delivery source for the current load (not library path). */
  playSource: "none",
  /** Delivery profile tag actually used or intended (null when none). */
  playProfileId: null,
  /** Machine reason when playSource is unavailable. */
  playBlockReason: null,
  /** User-visible play block message (null when clear) */
  playNotice: null,
  /** Resolved cover URLs for PlayerBar (local OPFS or remote / placeholder). */
  coverThumb: PLACEHOLDER_COVER,
  coverFull: PLACEHOLDER_COVER,
  /** Expanded now-playing: lyrics overlay open */
  lyricsOpen: false,
  loadPending: false,
});

/**
 * Atomic writer for the play-source triple (never leave a field stale).
 */
export function setPlaySourceState(
  playSource: PlaySourceState,
  playProfileId: string | null,
  playBlockReason: PlayBlockReason | null,
) {
  player.playSource = playSource;
  player.playProfileId = playProfileId || null;
  player.playBlockReason = playBlockReason || null;
}

export function clearPlaySourceState() {
  setPlaySourceState("none", null, null);
}

export function setPlayNotice(msg: string | null | undefined) {
  player.playNotice = msg || null;
}
