/**
 * Play-button decision while a queue load may be waiting on encode.
 */
import type { PlaySourceState } from "@/playBlock";

export type PlayTapAction =
  | "noop"
  | "flip-want"
  | "resume"
  | "reload"
  | "start-first";

export function playTapAction(opts: {
  hasTracks: boolean;
  index: number;
  loadInFlight: boolean;
  playSource: PlaySourceState;
}): PlayTapAction {
  if (!opts.hasTracks) return "noop";
  if (opts.loadInFlight) return "flip-want";
  if (opts.index < 0) return "start-first";
  if (opts.playSource === "streaming" || opts.playSource === "downloaded") {
    return "resume";
  }
  return "reload";
}
