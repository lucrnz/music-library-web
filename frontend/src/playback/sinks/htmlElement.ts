/**
 * Shared HTMLAudioElement primitives. Not a PlaybackSink.
 */

export function attachHtmlAudio(audio: HTMLAudioElement): void {
  if (typeof document === "undefined" || audio.isConnected) return;
  audio.hidden = true;
  document.body.appendChild(audio);
}

export function setHtmlAudioSrc(audio: HTMLAudioElement, url: string): void {
  audio.src = url;
}

export function stopHtmlAudio(audio: HTMLAudioElement): void {
  audio.pause();
  audio.removeAttribute("src");
  audio.load();
}

export function setHtmlAudioVolume(audio: HTMLAudioElement, v: number): void {
  audio.volume = Math.min(1, Math.max(0, Number(v) || 0));
}

export function waitAudioEvent(
  el: HTMLAudioElement,
  name: string,
): Promise<void> {
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

export function waitAudioEventWithTimeout(
  el: HTMLAudioElement,
  name: string,
  timeoutMs: number,
): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  return Promise.race([
    waitAudioEvent(el, name),
    new Promise<void>((_, reject) => {
      timer = setTimeout(
        () => reject(new Error("audio canplay timeout")),
        timeoutMs,
      );
    }),
  ]).finally(() => {
    if (timer != null) clearTimeout(timer);
  });
}
