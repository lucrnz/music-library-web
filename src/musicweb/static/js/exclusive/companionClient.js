/**
 * WebSocket client to loopback exclusive companion (ws://127.0.0.1:port).
 */
import {
  exclusiveAudio,
} from "../stores/exclusiveAudio.js";
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
} from "./protocol.js";

/** @type {WebSocket | null} */
let ws = null;
/** @type {ReturnType<typeof setInterval> | null} */
let heartbeatTimer = null;
/** @type {ReturnType<typeof setTimeout> | null} */
let reconnectTimer = null;
let reconnectAttempt = 0;
let wantConnected = false;
let intentionalClose = false;

/** @type {Set<(evt: { type: string, [k: string]: unknown }) => void>} */
const listeners = new Set();

/**
 * @param {(evt: { type: string, [k: string]: unknown }) => void} fn
 * @returns {() => void}
 */
export function onCompanionEvent(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function emit(evt) {
  for (const fn of listeners) {
    try {
      fn(evt);
    } catch (err) {
      console.error("[exclusive] listener error", err);
    }
  }
}

function clearHeartbeat() {
  if (heartbeatTimer != null) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }
}

function clearReconnect() {
  if (reconnectTimer != null) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
}

function send(msg) {
  if (!ws || ws.readyState !== WebSocket.OPEN) return false;
  try {
    ws.send(JSON.stringify(msg));
    return true;
  } catch {
    return false;
  }
}

function scheduleReconnect() {
  if (!wantConnected || reconnectTimer != null) return;
  const delay = Math.min(10000, 500 * Math.pow(1.6, reconnectAttempt));
  reconnectAttempt += 1;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    connectNow();
  }, delay);
}

function handleMessage(raw) {
  let msg;
  try {
    msg = JSON.parse(raw);
  } catch {
    return;
  }
  if (!msg || typeof msg !== "object") return;
  const type = msg.type;

  if (type === MSG_HELLO_OK) {
    exclusiveAudio.connection = "connected";
    exclusiveAudio.role = msg.role || null;
    exclusiveAudio.lastError = null;
    reconnectAttempt = 0;
    applyStatus(msg);
    // Refresh devices when we become controller
    if (msg.role === ROLE_CONTROLLER) {
      send(envelope(MSG_LIST_DEVICES));
    }
    emit({ type: "hello_ok", role: msg.role });
    return;
  }

  if (type === MSG_HELLO_REJECT) {
    exclusiveAudio.connection = "rejected";
    exclusiveAudio.role = null;
    exclusiveAudio.lastError = msg.reason || "rejected";
    emit({ type: "hello_reject", reason: msg.reason });
    return;
  }

  if (type === MSG_STATUS) {
    if (msg.role) exclusiveAudio.role = msg.role;
    applyStatus(msg);
    emit({ type: "status", ...msg });
    return;
  }

  if (type === MSG_DEVICES) {
    const list = Array.isArray(msg.devices) ? msg.devices : [];
    exclusiveAudio.devices = list.map((d) => ({
      id: d.id,
      name: d.name || d.id,
      sample_rates: d.sample_rates || d.sampleRates || [],
      bit_depths: d.bit_depths || d.bitDepths || [],
    }));
    // Keep selected device if still present
    if (
      exclusiveAudio.selectedDeviceId &&
      !exclusiveAudio.devices.some((d) => d.id === exclusiveAudio.selectedDeviceId)
    ) {
      exclusiveAudio.selectedDeviceId = null;
    }
    emit({ type: "devices", devices: exclusiveAudio.devices });
    return;
  }

  if (type === MSG_TIME) {
    emit({ type: "time", t: msg.t, d: msg.d });
    return;
  }

  if (type === MSG_PAUSE_EVENT) {
    exclusiveAudio.companionPaused = !!msg.paused;
    emit({ type: "pause", paused: !!msg.paused });
    return;
  }

  if (type === MSG_EOF) {
    emit({ type: "eof" });
    return;
  }

  if (type === MSG_ERROR) {
    exclusiveAudio.lastError = msg.message || "companion error";
    emit({
      type: "error",
      message: msg.message,
      code: msg.code,
    });
  }
}

function applyStatus(msg) {
  if (msg.selected_device_id != null) {
    // Don't clobber local selection with null unless companion has none
    if (msg.selected_device_id) {
      exclusiveAudio.selectedDeviceId = msg.selected_device_id;
    }
  }
  if (typeof msg.playing === "boolean") {
    exclusiveAudio.companionPlaying = msg.playing;
  }
  if (typeof msg.paused === "boolean") {
    exclusiveAudio.companionPaused = msg.paused;
  }
  // If we lost controller, surface that
  if (msg.role === ROLE_READONLY && msg.reason === "controller_ttl") {
    exclusiveAudio.lastError = "controller_ttl";
  }
}

function connectNow() {
  if (!wantConnected) return;
  if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
    return;
  }

  const token = (exclusiveAudio.hogToken || "").trim();
  if (!token) {
    exclusiveAudio.connection = "disconnected";
    return;
  }

  const port = exclusiveAudio.port || 18765;
  // Always 127.0.0.1 — never localhost (IPv6 ::1 mismatch).
  const url = `ws://127.0.0.1:${port}/ws`;
  exclusiveAudio.connection = "connecting";
  intentionalClose = false;

  try {
    ws = new WebSocket(url);
  } catch (err) {
    exclusiveAudio.connection = "disconnected";
    exclusiveAudio.lastError = String(err);
    scheduleReconnect();
    return;
  }

  ws.onopen = () => {
    send(
      envelope(MSG_HELLO, {
        token,
        sessionId: exclusiveAudio.sessionId,
      })
    );
    clearHeartbeat();
    heartbeatTimer = setInterval(() => {
      send(envelope(MSG_HEARTBEAT));
    }, HEARTBEAT_INTERVAL_MS);
  };

  ws.onmessage = (ev) => handleMessage(ev.data);

  ws.onerror = () => {
    exclusiveAudio.lastError = "websocket error";
  };

  ws.onclose = () => {
    clearHeartbeat();
    ws = null;
    exclusiveAudio.connection = "disconnected";
    exclusiveAudio.role = null;
    exclusiveAudio.companionPlaying = false;
    if (!intentionalClose && wantConnected) {
      emit({ type: "disconnect" });
      scheduleReconnect();
    }
  };
}

export function disconnectCompanion() {
  wantConnected = false;
  intentionalClose = true;
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
  exclusiveAudio.connection = "disconnected";
  exclusiveAudio.role = null;
}

/**
 * Connect when exclusive enabled + token; disconnect otherwise.
 */
export function syncCompanionConnection() {
  const should =
    exclusiveAudio.capable &&
    exclusiveAudio.enabled &&
    !!(exclusiveAudio.hogToken || "").trim();

  if (!should) {
    disconnectCompanion();
    return;
  }
  wantConnected = true;
  // If port/token changed while open, reconnect.
  if (ws && ws.readyState === WebSocket.OPEN) {
    intentionalClose = true;
    try {
      ws.close();
    } catch {
      /* ignore */
    }
    ws = null;
  }
  clearReconnect();
  reconnectAttempt = 0;
  connectNow();
}

export function requestListDevices() {
  return send(envelope(MSG_LIST_DEVICES));
}

/**
 * @param {string} deviceId
 */
export function requestSetDevice(deviceId) {
  if (exclusiveAudio.role !== ROLE_CONTROLLER) return false;
  return send(envelope(MSG_SET_DEVICE, { deviceId }));
}

/**
 * @param {string} url absolute http(s)
 */
export function companionLoad(url) {
  if (exclusiveAudio.role !== ROLE_CONTROLLER) return false;
  return send(envelope(MSG_LOAD, { url }));
}

export function companionPause() {
  return send(envelope(MSG_PAUSE));
}

export function companionResume() {
  return send(envelope(MSG_RESUME));
}

export function companionStop() {
  return send(envelope(MSG_STOP));
}

/**
 * @param {number} t seconds
 */
export function companionSeek(t) {
  return send(envelope(MSG_SEEK, { t }));
}

/**
 * @param {number} volume0to100
 */
export function companionSetVolume(volume0to100) {
  return send(envelope(MSG_SET_VOLUME, { volume: volume0to100 }));
}

