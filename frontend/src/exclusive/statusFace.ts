/**
 * Pure exclusive status face — one vocabulary for NP chrome and Settings.
 * No WebSocket side effects.
 */

import { ROLE_CONTROLLER, ROLE_READONLY } from "@/exclusive/protocol";

/** Icon sprite name (see templates/index.html #i-source-exclusive). */
export const EXCLUSIVE_FACE_ICON = "source-exclusive";

export type ExclusiveFaceKind =
  | "needs_device"
  | "connecting"
  | "offline"
  | "rejected"
  | "readonly"
  | "ready";

export interface ExclusiveFaceDevice {
  id: string;
  name?: string;
}

export interface ExclusiveFaceSnapshot {
  enabled: boolean;
  /** disconnected | connecting | connected | rejected */
  connection: string;
  role: string | null;
  lastError?: string | null;
  preferenceId: string | null;
  liveId: string | null;
  devices?: ExclusiveFaceDevice[];
}

export interface ExclusiveFace {
  kind: ExclusiveFaceKind;
  text: string;
  icon: string;
  interactive: boolean;
}

export function deviceDisplayName(
  id: string | null | undefined,
  devices: ExclusiveFaceDevice[] = [],
): string | null {
  if (!id) return null;
  const hit = (devices || []).find((d) => d.id === id);
  return (hit && hit.name) || id;
}

/** Null when exclusive is not enabled. */
export function formatExclusiveFace(
  snap: ExclusiveFaceSnapshot | null | undefined,
): ExclusiveFace | null {
  if (!snap || !snap.enabled) return null;

  const icon = EXCLUSIVE_FACE_ICON;
  const devices = snap.devices || [];

  if (snap.connection === "connecting") {
    return {
      kind: "connecting",
      text: "Connecting…",
      icon,
      interactive: true,
    };
  }

  if (snap.connection === "rejected") {
    const err = (snap.lastError || "").trim();
    const safe =
      err &&
      err.length < 80 &&
      !err.includes("Error") &&
      err !== "websocket error"
        ? err
        : "Auth rejected";
    return {
      kind: "rejected",
      text: safe,
      icon,
      interactive: true,
    };
  }

  if (snap.connection !== "connected") {
    return {
      kind: "offline",
      text: "Companion offline",
      icon,
      interactive: true,
    };
  }

  if (snap.role === ROLE_READONLY) {
    return {
      kind: "readonly",
      text: "Controlled elsewhere",
      icon,
      interactive: true,
    };
  }

  // Connected controller (or role not yet set — treat as not ready).
  if (snap.role && snap.role !== ROLE_CONTROLLER) {
    return {
      kind: "readonly",
      text: "Controlled elsewhere",
      icon,
      interactive: true,
    };
  }

  const live = snap.liveId || null;
  const liveOk =
    !!live && (devices.length === 0 || devices.some((d) => d.id === live));

  if (liveOk) {
    const name = deviceDisplayName(live, devices) || live;
    return {
      kind: "ready",
      text: `Ready · ${name}`,
      icon,
      interactive: true,
    };
  }

  if (!snap.preferenceId) {
    return {
      kind: "needs_device",
      text: "Needs device",
      icon,
      interactive: true,
    };
  }

  // Preference set, waiting for companion to accept set_device.
  return {
    kind: "connecting",
    text: "Connecting…",
    icon,
    interactive: true,
  };
}
