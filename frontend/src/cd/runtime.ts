/** Wiring between CD store and transport without circular imports. */

type Fn = () => void;

let onEnter: Fn | null = null;
let onMediaGone: Fn | null = null;

export function bindCdRuntime(enter: Fn, gone: Fn): void {
  onEnter = enter;
  onMediaGone = gone;
}

export function notifyCdEnter(): void {
  onEnter?.();
}

export function notifyCdMediaGone(): void {
  onMediaGone?.();
}
