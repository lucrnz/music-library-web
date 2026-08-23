/**
 * WebSocket client to loopback exclusive companion (ws://127.0.0.1:port).
 */
import { PLAY_BLOCK_MESSAGES, type PlayBlockReason } from "@/playBlock";
import {
  clearSelectedDevicePreference,
  exclusiveAudio,
  isExclusiveArmed,
  isExclusiveEnabled,
  setCompanionDeviceId,
  setExclusiveLive,
  type ExclusiveDevice,
} from "@/stores/exclusiveAudio";
import {
  HEARTBEAT_INTERVAL_MS,
  MSG_DEVICES,
  MSG_EOF,
  MSG_ERROR,
  MSG_HEARTBEAT,
  MSG_HELLO,
  MSG_HELLO_OK,
  MSG_HELLO_REJECT,
  MSG_LIST_DEVICES,
  MSG_LOAD,
  MSG_PAUSE,
  MSG_PAUSE_EVENT,
  MSG_RESUME,
  MSG_SEEK,
  MSG_SET_DEVICE,
  MSG_SET_VOLUME,
  MSG_STATUS,
  MSG_STOP,
  MSG_TIME,
  ROLE_CONTROLLER,
  ROLE_READONLY,
  envelope,
} from "@/exclusive/protocol";

export type { ExclusiveDevice };

export interface CompanionEvent {
  type: string;
  t?: unknown;
  d?: unknown;
  paused?: unknown;
  message?: string;
  code?: string | null;
  reason?: unknown;
  role?: unknown;
  devices?: ExclusiveDevice[];
}

interface CompanionWireMessage {
  type?: string;
  role?: string;
  reason?: string;
  devices?: unknown;
  t?: unknown;
  d?: unknown;
  paused?: unknown;
  playing?: unknown;
  message?: string;
  code?: string;
  selected_device_id?: unknown;
}

let ws: WebSocket | null = null;
let inFlightKey: string | null = null;
let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let reconnectAttempt = 0;
let wantConnected = false;
let intentionalClose = false;

function desiredConnectKey(): string {
  const port = exclusiveAudio.port || 18765;
  const token = (exclusiveAudio.companionToken || "").trim();
  return `${port}\0${token}`;
}

/** OPEN or CONNECTING. close() goes to CLOSING, so connectNow can assign a new socket. */
function isLiveSocket(socket: WebSocket | null): socket is WebSocket {
  return (
    !!socket &&
    (socket.readyState === WebSocket.OPEN ||
      socket.readyState === WebSocket.CONNECTING)
  );
}

const listeners = new Set<(evt: CompanionEvent) => void>();

export function onCompanionEvent(
  fn: (evt: CompanionEvent) => void,
): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

function emit(evt: CompanionEvent): void {
  for (const fn of listeners) {
    try {
      fn(evt);
    } catch (err: unknown) {
      console.error("[exclusive] listener error", err);
    }
  }
}

function clearHeartbeat(): void {
  if (heartbeatTimer != null) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }
}

function clearReconnect(): void {
  if (reconnectTimer != null) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
}

function clearLiveDevice(): void {
  setCompanionDeviceId(null);
}

function send(msg: Record<string, unknown>): boolean {
  if (!ws || ws.readyState !== WebSocket.OPEN) return false;
  try {
    ws.send(JSON.stringify(msg));
    return true;
  } catch {
    return false;
  }
}

function scheduleReconnect(): void {
  if (!wantConnected || reconnectTimer != null) return;
  const delay = Math.min(10000, 500 * Math.pow(1.6, reconnectAttempt));
  reconnectAttempt += 1;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    connectNow();
  }, delay);
}

/**
 * If controller + preference set and live missing/mismatch → set_device.
 * Single place for re-arm; no auto-pick.
 */
export function syncPreferredDevice(): boolean {
  if (exclusiveAudio.role !== ROLE_CONTROLLER) return false;
  const pref = exclusiveAudio.selectedDeviceId;
  if (!pref) return false;
  if (exclusiveAudio.devices.length > 0 && !exclusiveAudio.devices.some((d) => d.id === pref)) {
    return false;
  }
  const live = exclusiveAudio.companionDeviceId;
  if (live === pref) return true;
  return requestSetDevice(pref);
}

export type EnsurePreferredDeviceResult =
  | { ok: true }
  | { ok: false; reason: PlayBlockReason };

/**
 * Ensure preference is live on companion before exclusive play.
 */
export async function ensurePreferredDevice({
  timeoutMs = 1500,
}: { timeoutMs?: number } = {}): Promise<EnsurePreferredDeviceResult> {
  if (!isExclusiveEnabled()) {
    return { ok: false, reason: "exclusive_not_ready" };
  }
  if (!(exclusiveAudio.companionToken || "").trim()) {
    return { ok: false, reason: "exclusive_not_ready" };
  }
  if (exclusiveAudio.connection === "rejected") {
    return { ok: false, reason: "exclusive_not_ready" };
  }
  if (exclusiveAudio.role === ROLE_READONLY) {
    return { ok: false, reason: "exclusive_readonly" };
  }
  if (exclusiveAudio.connection !== "connected" || exclusiveAudio.role !== ROLE_CONTROLLER) {
    return { ok: false, reason: "exclusive_not_ready" };
  }
  if (!exclusiveAudio.selectedDeviceId) {
    return { ok: false, reason: "exclusive_needs_device" };
  }
  if (isExclusiveArmed() && exclusiveAudio.companionDeviceId === exclusiveAudio.selectedDeviceId) {
    return { ok: true };
  }

  syncPreferredDevice();

  const deadline = Date.now() + Math.max(0, timeoutMs);
  while (Date.now() < deadline) {
    if (isExclusiveArmed() && exclusiveAudio.companionDeviceId === exclusiveAudio.selectedDeviceId) {
      return { ok: true };
    }
    await new Promise<void>((r) => setTimeout(r, 50));
  }

  if (isExclusiveArmed() && exclusiveAudio.companionDeviceId === exclusiveAudio.selectedDeviceId) {
    return { ok: true };
  }
  return { ok: false, reason: "exclusive_needs_device" };
}

function handleMessage(raw: unknown): void {
  let msg: CompanionWireMessage;
  try {
    msg = JSON.parse(raw as string) as CompanionWireMessage;
  } catch {
    return;
  }
  if (!msg || typeof msg !== "object") return;
  const type = msg.type;

  if (type === MSG_HELLO_OK) {
    setExclusiveLive({
      connection: "connected",
      role: msg.role || null,
      lastError: null,
    });
    reconnectAttempt = 0;
    applyStatus(msg);
    if (msg.role === ROLE_CONTROLLER) {
      syncPreferredDevice();
      send(envelope(MSG_LIST_DEVICES));
    }
    emit({ type: "hello_ok", role: msg.role });
    return;
  }

  if (type === MSG_HELLO_REJECT) {
    setExclusiveLive({
      connection: "rejected",
      role: null,
    });
    clearLiveDevice();
    setExclusiveLive({ lastError: msg.reason || "rejected" });
    emit({ type: "hello_reject", reason: msg.reason });
    return;
  }

  if (type === MSG_STATUS) {
    if (msg.role) setExclusiveLive({ role: msg.role });
    applyStatus(msg);
    emit({ type: "status", ...msg } as CompanionEvent);
    return;
  }

  if (type === MSG_DEVICES) {
    const list = Array.isArray(msg.devices) ? msg.devices : [];
    const devices = list.map((d) => {
      const rec = d as {
        id: string;
        name?: string;
        sample_rates?: number[];
        bit_depths?: number[];
      };
      return {
        id: rec.id,
        name: rec.name || rec.id,
        sample_rates: rec.sample_rates || [],
        bit_depths: rec.bit_depths || [],
      };
    });
    setExclusiveLive({ devices });
    const pref = exclusiveAudio.selectedDeviceId;
    if (pref && !exclusiveAudio.devices.some((dev) => dev.id === pref)) {
      clearSelectedDevicePreference();
      emit({
        type: "error",
        code: "exclusive_needs_device",
        message: PLAY_BLOCK_MESSAGES.exclusive_needs_device,
      });
    } else {
      syncPreferredDevice();
    }
    emit({ type: "devices", devices: exclusiveAudio.devices });
    return;
  }

  if (type === MSG_TIME) {
    emit({ type: "time", t: msg.t, d: msg.d });
    return;
  }

  if (type === MSG_PAUSE_EVENT) {
    emit({ type: "pause", paused: !!msg.paused });
    return;
  }

  if (type === MSG_EOF) {
    emit({ type: "eof" });
    return;
  }

  if (type === MSG_ERROR) {
    setExclusiveLive({ lastError: msg.message || "companion error" });
    emit({
      type: "error",
      message: msg.message,
      code: msg.code,
    });
  }
}

function applyStatus(msg: CompanionWireMessage): void {
  // Live hog target only — never write user preference from companion.
  if ("selected_device_id" in msg) {
    const raw = msg.selected_device_id;
    if (raw) {
      setCompanionDeviceId(String(raw));
    } else {
      clearLiveDevice();
    }
  }

  // TTL demotion: socket stays open so disconnect does not fire — hard-stop via error.
  if (msg.role === ROLE_READONLY && msg.reason === "controller_ttl") {
    setExclusiveLive({ lastError: "controller_ttl" });
    clearLiveDevice();
    emit({
      type: "error",
      code: "controller_lost",
      message: "Exclusive controller timed out",
    });
  }
}

function connectNow(): void {
  if (!wantConnected) return;
  if (isLiveSocket(ws)) {
    return;
  }

  const token = (exclusiveAudio.companionToken || "").trim();
  if (!token) {
    setExclusiveLive({ connection: "disconnected" });
    return;
  }

  const port = exclusiveAudio.port || 18765;
  // Always 127.0.0.1 — never localhost (IPv6 ::1 mismatch).
  const url = `ws://127.0.0.1:${port}/ws`;
  setExclusiveLive({ connection: "connecting" });
  intentionalClose = false;

  try {
    ws = new WebSocket(url);
  } catch (err: unknown) {
    setExclusiveLive({ connection: "disconnected", lastError: String(err) });
    scheduleReconnect();
    return;
  }
  inFlightKey = desiredConnectKey();

  ws.onopen = () => {
    send(
      envelope(MSG_HELLO, {
        token,
        sessionId: exclusiveAudio.sessionId,
      }),
    );
    clearHeartbeat();
    heartbeatTimer = setInterval(() => {
      send(envelope(MSG_HEARTBEAT));
    }, HEARTBEAT_INTERVAL_MS);
  };

  ws.onmessage = (ev) => handleMessage(ev.data);

  ws.onerror = () => {
    setExclusiveLive({ lastError: "websocket error" });
  };

  ws.onclose = (event) => {
    if (event.target !== ws) return;
    clearHeartbeat();
    ws = null;
    setExclusiveLive({
      connection: "disconnected",
      role: null,
    });
    clearLiveDevice();
    if (!intentionalClose && wantConnected) {
      emit({ type: "disconnect" });
      scheduleReconnect();
    }
  };
}

export function disconnectCompanion(): void {
  wantConnected = false;
  intentionalClose = true;
  inFlightKey = null;
  clearReconnect();
  clearHeartbeat();
  reconnectAttempt = 0;
  if (ws) {
    try {
      ws.close();
    } catch {
      /* ignore */
    }
    ws = null;
  }
  setExclusiveLive({ connection: "disconnected", role: null });
  clearLiveDevice();
}

/**
 * Connect when exclusive enabled + token; disconnect otherwise.
 */
export function syncCompanionConnection(): void {
  const should =
    exclusiveAudio.capable && exclusiveAudio.enabled && !!(exclusiveAudio.companionToken || "").trim();

  if (!should) {
    disconnectCompanion();
    return;
  }
  wantConnected = true;
  const desired = desiredConnectKey();
  if (isLiveSocket(ws) && desired === inFlightKey) {
    return;
  }
  if (isLiveSocket(ws)) {
    intentionalClose = true;
    clearHeartbeat();
    try {
      ws.close();
    } catch {
      /* ignore */
    }
  }
  clearReconnect();
  reconnectAttempt = 0;
  connectNow();
}

export function requestListDevices(): boolean {
  return send(envelope(MSG_LIST_DEVICES));
}

export function requestSetDevice(deviceId: string): boolean {
  if (exclusiveAudio.role !== ROLE_CONTROLLER) return false;
  return send(envelope(MSG_SET_DEVICE, { deviceId }));
}

/** @param url absolute http(s) */
export function companionLoad(url: string): boolean {
  if (exclusiveAudio.role !== ROLE_CONTROLLER) return false;
  return send(envelope(MSG_LOAD, { url }));
}

export function companionPause(): boolean {
  return send(envelope(MSG_PAUSE));
}

export function companionResume(): boolean {
  return send(envelope(MSG_RESUME));
}

export function companionStop(): boolean {
  return send(envelope(MSG_STOP));
}

/** @param t seconds */
export function companionSeek(t: number): boolean {
  return send(envelope(MSG_SEEK, { t }));
}

/** @param volume0to100 */
export function companionSetVolume(volume0to100: number): boolean {
  return send(envelope(MSG_SET_VOLUME, { volume: volume0to100 }));
}
