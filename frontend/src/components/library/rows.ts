/**
 * Shared track/album row presentation helpers for library components.
 */
import { coverUrl } from "@/api";
import { formatTrackLabel } from "@/util";
import { activeSession, become } from "@/playback/session";
import { pl, addToQueue } from "@/stores/playlist";
import { playIndex, player } from "@/stores/player";
import type { Track } from "@/models/track";

export { formatTrackLabel, coverUrl };

export type QueueEntry = Track | string;

export async function playOrQueueTrack(track: QueueEntry): Promise<void> {
  if (activeSession() === "cd") {
    become("queue");
    await addToQueue([track]);
    playIndex(pl.length - 1);
    return;
  }
  const startPlay = pl.length === 0 || player.paused;
  await addToQueue([track]);
  if (startPlay) playIndex(pl.length - 1);
}

export async function queueOnly(track: QueueEntry): Promise<void> {
  await addToQueue([track]);
}
