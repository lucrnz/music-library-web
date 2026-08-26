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
  setTokenCheck,
  type ExclusiveDevice,
} from "@/stores/exclusiveAudio";
import { canUseCompanionDownloads } from "@/exclusive/capability";
import {
  INITIAL_VOLUME_ADOPT,
  resolveCompanionStatusVolume,
  type CompanionVolumeAdoptState,
} from "@/exclusive/companionVolume";
import { downloads } from "@/downloads/state";
import { setOutputVolume } from "@/stores/playerPrefs";
import { player } from "@/stores/playerState";
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
  MSG_RELEASE_DEVICE,
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
  volume?: unknown;
  requestId?: string;
  key?: string;
  loaded?: number;
  data_dir?: string;
  total?: number | null;
  bytes?: number;
  exists?: boolean;
  free?: number;
}

let ws: WebSocket | null = null;
let inFlightKey: string | null = null;
let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
let heartbeatVisibilityBound = false;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let reconnectAttempt = 0;
let wantConnected = false;
let intentionalClose = false;
let tokenCheckGen = 0;
let probeWs: WebSocket | null = null;
let probeTimer: ReturnType<typeof setTimeout> | null = null;
let volumeAdopt: CompanionVolumeAdoptState = INITIAL_VOLUME_ADOPT;

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

function sendHeartbeat(): void {
  send(envelope(MSG_HEARTBEAT));
}

function startHeartbeat(): void {
  clearHeartbeat();
  sendHeartbeat();
  heartbeatTimer = setInterval(sendHeartbeat, HEARTBEAT_INTERVAL_MS);
  if (heartbeatVisibilityBound || typeof document === "undefined") return;
  heartbeatVisibilityBound = true;
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") sendHeartbeat();
  });
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
  volumeAdopt = INITIAL_VOLUME_ADOPT;
}

export function sendCompanion(msg: Record<string, unknown>): boolean {
  return send(msg);
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
  if (!isExclusiveEnabled()) return false;
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
      dataDir: typeof msg.data_dir === "string" ? msg.data_dir : exclusiveAudio.dataDir,
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
    const wasController = exclusiveAudio.role === ROLE_CONTROLLER;
    if (msg.role) setExclusiveLive({ role: msg.role });
    applyStatus(msg);
    if (exclusiveAudio.role === ROLE_CONTROLLER && !wasController) {
      syncPreferredDevice();
    }
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
    return;
  }

  if (type) {
    if (typeof msg.data_dir === "string" && msg.data_dir) {
      setExclusiveLive({ dataDir: msg.data_dir });
    }
    emit(msg as CompanionEvent);
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

  const resolved = resolveCompanionStatusVolume(volumeAdopt, {
    volume0to100: msg.volume,
    exclusiveEnabled: isExclusiveEnabled(),
    deviceId: exclusiveAudio.companionDeviceId,
    followAll: exclusiveAudio.role === ROLE_READONLY,
  });
  volumeAdopt = resolved.state;
  if (resolved.face != null && Math.abs(player.volume - resolved.face) > 1e-4) {
    // Status already holds this level — do not echo set_volume via sinks.
    setOutputVolume(resolved.face, { notifySinks: false });
  }

  // Idle un-hog: socket stays open. Next heartbeat / visibility reclaim.
  if (msg.role === ROLE_READONLY && msg.reason === "controller_ttl") {
    clearLiveDevice();
    sendHeartbeat();
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
    startHeartbeat();
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

/** Wait until hello_ok, hello_reject, or timeout. */
export function waitForCompanionConnection(
  timeoutMs = 4000,
): Promise<boolean> {
  if (exclusiveAudio.connection === "connected") return Promise.resolve(true);
  if (exclusiveAudio.connection === "rejected") return Promise.resolve(false);
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      unsub();
      resolve(exclusiveAudio.connection === "connected");
    }, timeoutMs);
    const unsub = onCompanionEvent((evt) => {
      if (evt.type === "hello_ok") {
        clearTimeout(timer);
        unsub();
        resolve(true);
      } else if (evt.type === "hello_reject" || evt.type === "disconnect") {
        clearTimeout(timer);
        unsub();
        resolve(false);
      }
    });
  });
}

function wantsCompanionSocket(): boolean {
  const token = !!(exclusiveAudio.companionToken || "").trim();
  const exclusiveOn = exclusiveAudio.capable && exclusiveAudio.enabled;
  const downloadsOn = canUseCompanionDownloads() && downloads.enabled;
  return token && (exclusiveOn || downloadsOn);
}

function clearTokenProbe(): void {
  if (probeTimer != null) {
    clearTimeout(probeTimer);
    probeTimer = null;
  }
  if (!probeWs) return;
  const socket = probeWs;
  probeWs = null;
  try {
    socket.close();
  } catch {
    /* ignore */
  }
}

function finishTokenProbe(gen: number, result: "accepted" | "invalid" | "unreachable") {
  if (gen !== tokenCheckGen) return;
  clearTokenProbe();
  setTokenCheck(result);
}

function openTokenProbe(token: string, gen: number): void {
  const port = exclusiveAudio.port || 18765;
  const url = `ws://127.0.0.1:${port}/ws`;
  let settled = false;
  const finish = (result: "accepted" | "invalid" | "unreachable") => {
    if (settled) return;
    settled = true;
    finishTokenProbe(gen, result);
  };

  let socket: WebSocket;
  try {
    socket = new WebSocket(url);
  } catch {
    finish("unreachable");
    return;
  }
  probeWs = socket;
  probeTimer = setTimeout(() => finish("unreachable"), 4000);

  socket.onopen = () => {
    try {
      socket.send(
        JSON.stringify(
          envelope(MSG_HELLO, { token, sessionId: `probe-${gen}` }),
        ),
      );
    } catch {
      finish("unreachable");
    }
  };
  socket.onmessage = (ev) => {
    let msg: { type?: string; reason?: string };
    try {
      msg = JSON.parse(String(ev.data)) as { type?: string; reason?: string };
    } catch {
      return;
    }
    if (msg.type === MSG_HELLO_OK) {
      finish("accepted");
    } else if (msg.type === MSG_HELLO_REJECT) {
      finish(msg.reason === "invalid_token" ? "invalid" : "unreachable");
    }
  };
  socket.onclose = () => {
    if (socket === probeWs) probeWs = null;
    finish("unreachable");
  };
}

/**
 * Prove the saved token via hello. Keeps a socket only when Exclusive or
 * Downloads already wants one; otherwise hello and hang up.
 */
export function checkCompanionToken(): void {
  const token = (exclusiveAudio.companionToken || "").trim();
  const gen = ++tokenCheckGen;
  clearTokenProbe();
  if (!token) {
    setTokenCheck("idle");
    return;
  }
  if (wantsCompanionSocket()) {
    syncCompanionConnection();
    if (exclusiveAudio.connection === "connected") {
      setTokenCheck("accepted");
      return;
    }
    if (exclusiveAudio.connection === "rejected") {
      setTokenCheck("invalid");
      return;
    }
    setTokenCheck("checking");
    void waitForCompanionConnection().then((ok) => {
      if (gen !== tokenCheckGen) return;
      if (ok || exclusiveAudio.connection === "connected") {
        setTokenCheck("accepted");
      } else if (exclusiveAudio.connection === "rejected") {
        setTokenCheck("invalid");
      } else {
        setTokenCheck("unreachable");
      }
    });
    return;
  }
  setTokenCheck("checking");
  openTokenProbe(token, gen);
}

/**
 * Connect when exclusive or companion-downloads is enabled and a token is set.
 */
export function syncCompanionConnection(): void {
  if (!wantsCompanionSocket()) {
    disconnectCompanion();
    return;
  }
  wantConnected = true;
  const desired = desiredConnectKey();
  if (isLiveSocket(ws) && desired === inFlightKey) {
    if (isExclusiveEnabled()) {
      syncPreferredDevice();
    } else {
      companionReleaseDevice();
    }
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

/** Unhog immediately. Socket and controller claim stay for Downloads. */
export function companionReleaseDevice(): boolean {
  const sent =
    exclusiveAudio.role === ROLE_CONTROLLER &&
    send(envelope(MSG_RELEASE_DEVICE));
  clearLiveDevice();
  emit({ type: "released" });
  return sent;
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
