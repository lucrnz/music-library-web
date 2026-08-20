/** Hard load/seek failures: 3 in 10s → tune out. Station advances do not count. */

export const RADIO_FAIL_WINDOW_MS = 10_000;
export const RADIO_FAIL_MAX = 3;

export function createFailureCap(
  windowMs = RADIO_FAIL_WINDOW_MS,
  max = RADIO_FAIL_MAX,
) {
  const times: number[] = [];
  return {
    record(now = Date.now()): boolean {
      times.push(now);
      const cutoff = now - windowMs;
      while (times.length && times[0]! < cutoff) times.shift();
      return times.length >= max;
    },
    reset(): void {
      times.length = 0;
    },
  };
}
