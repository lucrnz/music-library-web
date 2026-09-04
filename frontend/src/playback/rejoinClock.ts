export const REJOIN_INITIAL_MS = 1000;
export const REJOIN_CAP_MS = 8000;
export const REJOIN_MIN_MS = 250;

export function nextRejoinDelay(prevMs: number | null): number {
  if (prevMs == null) return REJOIN_INITIAL_MS;
  return Math.min(prevMs * 2, REJOIN_CAP_MS);
}

export function createRejoinClock(attempt: () => Promise<void>) {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let lastDelay: number | null = null;
  let inFlight = false;
  let scheduleAfter = false;

  function armTimer(): void {
    if (timer != null) return;
    lastDelay = nextRejoinDelay(lastDelay);
    timer = setTimeout(() => {
      timer = null;
      void run();
    }, lastDelay);
  }

  async function run(): Promise<void> {
    if (inFlight) return;
    inFlight = true;
    scheduleAfter = false;
    try {
      await attempt();
    } catch {
      /* caller schedules on failure */
    } finally {
      inFlight = false;
      if (scheduleAfter) armTimer();
    }
  }

  return {
    kick(): void {
      lastDelay = null;
      scheduleAfter = false;
      if (timer != null) {
        clearTimeout(timer);
        timer = null;
      }
      if (inFlight) return;
      timer = setTimeout(() => {
        timer = null;
        void run();
      }, REJOIN_MIN_MS);
    },
    schedule(): void {
      if (timer != null) return;
      if (inFlight) {
        scheduleAfter = true;
        return;
      }
      armTimer();
    },
    cancel(): void {
      if (timer != null) {
        clearTimeout(timer);
        timer = null;
      }
      lastDelay = null;
      scheduleAfter = false;
    },
  };
}
