/**
 * Radio-owned HTMLAudioElement. Not the shared on-demand html sink.
 */

export function shouldIgnoreTransport(loadInFlight: boolean, seekInFlight: boolean): boolean {
  return loadInFlight || seekInFlight;
}

export interface RadioAudio {
  readonly el: HTMLAudioElement | null;
  loadInFlight: boolean;
  seekInFlight: boolean;
  currentTime: number;
  paused: boolean;
  load(url: string): Promise<void>;
  seek(seconds: number): Promise<void>;
  play(): Promise<void>;
  stop(): void;
  setVolume(v: number): void;
  onPause(fn: () => void): void;
  onEnded(fn: () => void): void;
  onError(fn: () => void): void;
}

export function createRadioAudio(): RadioAudio {
  const el = typeof Audio !== "undefined" ? new Audio() : null;
  if (el) {
    el.preload = "auto";
  }
  let loadInFlight = false;
  let seekInFlight = false;
  let onPauseFn: (() => void) | null = null;
  let onEndedFn: (() => void) | null = null;
  let onErrorFn: (() => void) | null = null;

  if (el) {
    el.addEventListener("pause", () => {
      if (shouldIgnoreTransport(loadInFlight, seekInFlight)) return;
      onPauseFn?.();
    });
    el.addEventListener("ended", () => {
      if (shouldIgnoreTransport(loadInFlight, seekInFlight)) return;
      onEndedFn?.();
    });
    el.addEventListener("error", () => {
      if (shouldIgnoreTransport(loadInFlight, seekInFlight)) return;
      onErrorFn?.();
    });
  }

  return {
    el,
    get loadInFlight() {
      return loadInFlight;
    },
    set loadInFlight(v: boolean) {
      loadInFlight = v;
    },
    get seekInFlight() {
      return seekInFlight;
    },
    set seekInFlight(v: boolean) {
      seekInFlight = v;
    },
    get currentTime() {
      return el?.currentTime ?? 0;
    },
    get paused() {
      return el?.paused ?? true;
    },
    async load(url: string) {
      if (!el) return;
      loadInFlight = true;
      try {
        el.pause();
        el.src = url;
        el.load();
        await waitEvent(el, "canplay");
      } finally {
        loadInFlight = false;
      }
    },
    async seek(seconds: number) {
      if (!el) return;
      seekInFlight = true;
      try {
        const dur = Number.isFinite(el.duration) ? el.duration : seconds;
        el.currentTime = Math.max(0, Math.min(seconds, dur || seconds));
        await waitEvent(el, "seeked");
      } finally {
        seekInFlight = false;
      }
    },
    async play() {
      if (!el) return;
      await el.play();
    },
    stop() {
      if (!el) return;
      loadInFlight = false;
      seekInFlight = false;
      el.pause();
      el.removeAttribute("src");
      el.load();
    },
    setVolume(v: number) {
      if (!el) return;
      el.volume = Math.min(1, Math.max(0, v));
    },
    onPause(fn) {
      onPauseFn = fn;
    },
    onEnded(fn) {
      onEndedFn = fn;
    },
    onError(fn) {
      onErrorFn = fn;
    },
  };
}

function waitEvent(el: HTMLAudioElement, name: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const onOk = () => {
      cleanup();
      resolve();
    };
    const onErr = () => {
      cleanup();
      reject(new Error(`audio ${name} failed`));
    };
    const cleanup = () => {
      el.removeEventListener(name, onOk);
      el.removeEventListener("error", onErr);
    };
    el.addEventListener(name, onOk, { once: true });
    el.addEventListener("error", onErr, { once: true });
  });
}
