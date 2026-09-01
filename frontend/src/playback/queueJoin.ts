import { createJoinHold } from "@/playback/joinHold";
import { createRejoinClock } from "@/playback/rejoinClock";
import { NEAR_END_SECONDS } from "@/stores/playbackPosition";
import type { PlayBlockReason } from "@/playBlock";

const HARD_JOIN_BLOCKS = new Set<PlayBlockReason>([
  "codec_unsupported",
  "exclusive_needs_device",
  "exclusive_no_format",
  "exclusive_readonly",
  "exclusive_lossy",
  "missing",
  "broken",
  "no_id",
  "offline_no_local",
  "cd_not_ready",
]);

export function isHardJoinBlock(
  reason: string | null | undefined,
): boolean {
  return !!reason && HARD_JOIN_BLOCKS.has(reason as PlayBlockReason);
}

export function isNaturalEnded(currentTime: number, duration: number): boolean {
  if (!Number.isFinite(currentTime) || !Number.isFinite(duration) || duration <= 0) {
    return false;
  }
  return currentTime >= duration - NEAR_END_SECONDS;
}

export function createQueueJoin(attempt: () => Promise<void>) {
  const hold = createJoinHold();
  const clock = createRejoinClock(attempt);
  let userPauseMarked = false;
  let rejoinActive = false;

  function dropRejoin(): void {
    clock.cancel();
    rejoinActive = false;
  }

  return {
    get holdPending(): boolean {
      return hold.pending;
    },
    get rejoinActive(): boolean {
      return rejoinActive;
    },
    get userPauseMarked(): boolean {
      return userPauseMarked;
    },
    markUserPause(): void {
      userPauseMarked = true;
    },
    onPlaySucceeded(): void {
      dropRejoin();
      hold.start();
    },
    onIntentionalPause(): void {
      hold.cancel();
      dropRejoin();
      userPauseMarked = false;
    },
    onFailedJoin(): void {
      hold.cancel();
      rejoinActive = true;
      clock.schedule();
    },
    kick(): void {
      rejoinActive = true;
      clock.kick();
    },
    cancel(): void {
      hold.cancel();
      dropRejoin();
      userPauseMarked = false;
    },
  };
}
