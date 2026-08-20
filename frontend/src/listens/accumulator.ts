/** Pure 70% play-cycle rules. No player, storage, or fetch. */

export const LISTEN_SEEK_EPSILON_SECONDS = 2;
export const LISTEN_THRESHOLD = 0.7;

export type ListenPlaySource = "streaming" | "downloaded";

export interface ListenEvent {
  id: string;
  trackId: string;
  profile: string;
  playSource: ListenPlaySource;
  countedAt: string;
}

export interface ListenTimeSample {
  currentTime: number;
  duration: number | null;
  playing: boolean;
}

function knownDuration(value: number | null | undefined): number | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return null;
  }
  return value;
}

export function createListenCycle(opts: {
  trackId: string;
  durationSec: number | null;
  profile: string;
  playSource: string;
}): {
  onTime: (sample: ListenTimeSample) => ListenEvent | null;
  onEnded: () => ListenEvent | null;
  onRestart: () => null;
} {
  const canFire =
    opts.playSource === "streaming" || opts.playSource === "downloaded";
  const playSource = opts.playSource as ListenPlaySource;
  let duration = knownDuration(opts.durationSec);
  let lastCurrentTime: number | null = null;
  let listenedSec = 0;
  let fired = false;

  function emit(): ListenEvent | null {
    if (!canFire || fired) return null;
    fired = true;
    return {
      id: crypto.randomUUID(),
      trackId: opts.trackId,
      profile: opts.profile,
      playSource,
      countedAt: new Date().toISOString(),
    };
  }

  function maybeThreshold(): ListenEvent | null {
    if (duration == null || listenedSec < LISTEN_THRESHOLD * duration) {
      return null;
    }
    return emit();
  }

  function onTime(sample: ListenTimeSample): ListenEvent | null {
    const incoming = knownDuration(sample.duration);
    if (duration == null && incoming != null) duration = incoming;
    if (lastCurrentTime == null) {
      lastCurrentTime = sample.currentTime;
      return maybeThreshold();
    }
    if (!sample.playing) {
      lastCurrentTime = sample.currentTime;
      return null;
    }
    const delta = sample.currentTime - lastCurrentTime;
    lastCurrentTime = sample.currentTime;
    if (delta > 0 && delta <= LISTEN_SEEK_EPSILON_SECONDS) {
      listenedSec += delta;
    }
    return maybeThreshold();
  }

  function onEnded(): ListenEvent | null {
    if (duration != null) return null;
    return emit();
  }

  function onRestart(): null {
    listenedSec = 0;
    lastCurrentTime = null;
    fired = false;
    return null;
  }

  return { onTime, onEnded, onRestart };
}
