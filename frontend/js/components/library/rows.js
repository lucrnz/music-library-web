/**
 * Shared track/album row presentation helpers for library components.
 */
import { coverUrl } from "../../api.js";
import { formatTrackLabel } from "../../util.js";
import { pl, addToQueue } from "../../stores/playlist.js";
import { playIndex, player } from "../../stores/player.js";

export { formatTrackLabel, coverUrl };

export async function playOrQueueTrack(track) {
  const startPlay = pl.length === 0 || player.paused;
  await addToQueue([track]);
  if (startPlay) playIndex(pl.length - 1);
}

export async function queueOnly(track) {
  await addToQueue([track]);
}
