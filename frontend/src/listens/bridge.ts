/**
 * Player-facing listen adapter. Owns the current cycle; player only calls.
 */
import {
  createListenCycle,
  type ListenEvent,
  type ListenTimeSample,
} from "@/listens/accumulator";
import { enqueueListen } from "@/listens/flush";

type Cycle = ReturnType<typeof createListenCycle>;

let current: Cycle | null = null;

function take(event: ListenEvent | null): ListenEvent | null {
  if (event) enqueueListen(event);
  return event;
}

export function startCycle(opts: {
  trackId: string;
  durationSec: number | null;
  profile: string;
  playSource: string;
}): void {
  current = createListenCycle(opts);
}

export function onTime(sample: ListenTimeSample): ListenEvent | null {
  if (!current) return null;
  return take(current.onTime(sample));
}

export function onEnded(): ListenEvent | null {
  if (!current) return null;
  return take(current.onEnded());
}

export function onRestart(): null {
  current?.onRestart();
  return null;
}

export function discard(): void {
  current = null;
}
