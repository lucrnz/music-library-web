/**
 * Pure on-demand companion-stop decision.
 * Exclusive same-sink loads must not release the hog.
 */
import type { PlayIntent, PlaySink } from "@/playback/playIntent";

export function needsCompanionStop(
  intent: PlayIntent,
  activeKind: PlaySink,
): boolean {
  if (intent.source === "unavailable") return true;
  return intent.sink !== activeKind;
}
