export const JOIN_HOLD_MS = 8000;

export function createJoinHold() {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let pending = false;

  return {
    get pending(): boolean {
      return pending;
    },
    start(): void {
      if (timer != null) {
        clearTimeout(timer);
        timer = null;
      }
      pending = true;
      timer = setTimeout(() => {
        timer = null;
        pending = false;
      }, JOIN_HOLD_MS);
    },
    cancel(): void {
      if (timer != null) {
        clearTimeout(timer);
        timer = null;
      }
      pending = false;
    },
  };
}
