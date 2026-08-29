/**
 * Session owner: none | queue | radio | cd. Does not import radio.ts or player.ts.
 */
import { clearPlaySourceState } from "@/stores/playerState";

const msSupported = typeof navigator !== "undefined" && "mediaSession" in navigator;

export type ActiveSession = "none" | "queue" | "radio" | "cd";

export interface OnDemandMediaHandlers {
  play: () => void;
  pause: () => void;
  previous: () => void;
  next: () => void;
  seekto: MediaSessionActionHandler;
}

let active: ActiveSession = "none";
let leaveQueueFn: (() => void) | null = null;
let leaveRadioFn: (() => void) | null = null;
let leaveCdFn: (() => void) | null = null;
let onDemandHandlers: OnDemandMediaHandlers | null = null;
let suspended = false;

export function onLeaveQueue(fn: (() => void) | null): void {
  leaveQueueFn = fn;
}

export function onLeaveRadio(fn: (() => void) | null): void {
  leaveRadioFn = fn;
}

export function onLeaveCd(fn: (() => void) | null): void {
  leaveCdFn = fn;
}

export function become(next: ActiveSession): void {
  if (next === active) return;
  if (active === "radio") leaveRadioFn?.();
  if (active === "cd") leaveCdFn?.();
  if (active === "queue") {
    clearPlaySourceState();
    leaveQueueFn?.();
  }
  active = next;
  if (next === "radio" || next === "cd") suspendMediaSession();
  else restoreMediaSession();
}

export function activeSession(): ActiveSession {
  return active;
}

export function queueActionsAllowed(): boolean {
  return active === "queue" || active === "none";
}

export function installOnDemandMediaSession(handlers: OnDemandMediaHandlers): void {
  onDemandHandlers = handlers;
  if (!suspended) applyOnDemandHandlers();
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
