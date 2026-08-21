/**
 * On-demand sink stop + Media Session install/restore/suspend.
 * Does not import radio.ts or player.ts.
 */
import { clearPlaySourceState } from "@/stores/playerState";

const msSupported = typeof navigator !== "undefined" && "mediaSession" in navigator;

export interface OnDemandMediaHandlers {
  play: () => void;
  pause: () => void;
  previous: () => void;
  next: () => void;
  seekto: MediaSessionActionHandler;
}

let stopSinksFn: (() => void) | null = null;
let bumpLoadFn: (() => void) | null = null;
let onDemandHandlers: OnDemandMediaHandlers | null = null;
let suspended = false;
let onDemandClaimHook: (() => void) | null = null;

export function bindOnDemandControl(opts: {
  stopSinks: () => void;
  bumpLoadGeneration: () => void;
}): void {
  stopSinksFn = opts.stopSinks;
  bumpLoadFn = opts.bumpLoadGeneration;
}

export function installOnDemandMediaSession(handlers: OnDemandMediaHandlers): void {
  onDemandHandlers = handlers;
  if (!suspended) applyOnDemandHandlers();
}

export function stopOnDemandSinks(): void {
  bumpLoadFn?.();
  clearPlaySourceState();
  stopSinksFn?.();
}

/** Radio registers exit-to-inactive here so player.ts need not import radio. */
export function setOnDemandClaimHook(fn: (() => void) | null): void {
  onDemandClaimHook = fn;
}

export function claimOnDemand(): void {
  onDemandClaimHook?.();
  restoreMediaSession();
}

export function suspendMediaSession(): void {
  suspended = true;
}

export function restoreMediaSession(): void {
  suspended = false;
  applyOnDemandHandlers();
}

function applyOnDemandHandlers(): void {
  if (!msSupported || !onDemandHandlers) return;
  const handlers = onDemandHandlers;
  navigator.mediaSession.setActionHandler("play", handlers.play);
  navigator.mediaSession.setActionHandler("pause", handlers.pause);
  navigator.mediaSession.setActionHandler("previoustrack", handlers.previous);
  navigator.mediaSession.setActionHandler("nexttrack", handlers.next);
  navigator.mediaSession.setActionHandler("seekto", handlers.seekto);
  navigator.mediaSession.setActionHandler("stop", null);
}
