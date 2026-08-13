/**
 * Pure exclusive status face — one vocabulary for NP chrome and Settings.
 * No WebSocket side effects.
 */

import { ROLE_CONTROLLER, ROLE_READONLY } from "./protocol.js";

/** Icon sprite name (see templates/index.html #i-source-exclusive). */
export const EXCLUSIVE_FACE_ICON = "source-exclusive";

/**
 * @typedef {'needs_device' | 'connecting' | 'offline' | 'rejected' | 'readonly' | 'ready'} ExclusiveFaceKind
 *
 * @typedef {object} ExclusiveFaceSnapshot
 * @property {boolean} enabled
 * @property {string} connection  disconnected | connecting | connected | rejected
 * @property {string|null} role
 * @property {string|null} [lastError]
 * @property {string|null} preferenceId
 * @property {string|null} liveId
 * @property {{ id: string, name?: string }[]} [devices]
 *
 * @typedef {object} ExclusiveFace
 * @property {ExclusiveFaceKind} kind
 * @property {string} text
 * @property {string} icon
 * @property {boolean} interactive
 */

/**
 * @param {string|null|undefined} id
 * @param {{ id: string, name?: string }[]} devices
 */
export function deviceDisplayName(id, devices = []) {
  if (!id) return null;
  const hit = (devices || []).find((d) => d.id === id);
  return (hit && hit.name) || id;
}

/**
 * @param {ExclusiveFaceSnapshot | null | undefined} snap
 * @returns {ExclusiveFace | null} null when exclusive is not enabled
 */
export function formatExclusiveFace(snap) {
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
    !!live &&
    (devices.length === 0 || devices.some((d) => d.id === live));

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
