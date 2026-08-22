/**
 * Radio WebSocket only. Face/load live in radio/session.ts.
 * Chrome face stays in stores/radio.ts.
 */
import {
  applySnapshot,
  onRadioSocketReconnect,
  radio,
  radioChromeActive,
} from "@/stores/radio";
import { getActiveStreamCodec } from "@/stores/settings";

interface TuneAck {
  ok: boolean;
  error?: string;
  face?: string;
}

let socket: WebSocket | null = null;
let pendingAck: ((value: TuneAck) => void) | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

export function socketRequired(): boolean {
  return radio.tabOpen || radioChromeActive();
}

function radioWsUrl(): string {
  const proto = location.protocol === "https:" ? "wss:" : "ws:";
  return `${proto}//${location.host}/api/radio/ws`;
}

export function openSocket(): void {
  if (typeof WebSocket === "undefined") return;
  if (typeof location === "undefined" || !location.host) return;
  if (
    socket &&
    (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)
  ) {
    return;
  }
  const ws = new WebSocket(radioWsUrl());
  socket = ws;
  ws.addEventListener("open", () => {
    if (socket === ws) radio.connected = true;
  });
  ws.addEventListener("message", (ev) => {
    let data: unknown;
    try {
      data = JSON.parse(String(ev.data));
    } catch {
      return;
    }
    if (data && typeof data === "object" && "ok" in (data as object)) {
      pendingAck?.(data as TuneAck);
      pendingAck = null;
      return;
    }
    applySnapshot(data);
  });
  ws.addEventListener("close", () => {
    if (socket === ws) {
      socket = null;
      radio.connected = false;
      if (socketRequired()) scheduleReconnect();
    }
  });
}

function scheduleReconnect(): void {
  if (reconnectTimer != null) return;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    if (socketRequired()) {
      openSocket();
      void onReconnect();
    }
  }, 500);
}

async function onReconnect(): Promise<void> {
  await onRadioSocketReconnect();
}

export function sendJson(msg: object): void {
  if (!socket || socket.readyState !== WebSocket.OPEN) return;
  socket.send(JSON.stringify(msg));
}

function sendAndWait(msg: object): Promise<TuneAck> {
  if (!socket || socket.readyState !== WebSocket.OPEN) {
    return Promise.resolve({ ok: false, error: "not_connected" });
  }
  return new Promise((resolve) => {
    pendingAck = resolve;
    sendJson(msg);
    setTimeout(() => {
      if (pendingAck === resolve) {
        pendingAck = null;
        resolve({ ok: false, error: "timeout" });
      }
    }, 8000);
  });
}

export async function sendTuneIn(): Promise<boolean> {
  const codec = getActiveStreamCodec();
  radio.tunerProfile = codec;
  const ack = await sendAndWait({ type: "tune_in", codec });
  return ack.ok === true;
}

export function waitForSnapshot(timeoutMs = 4000): Promise<void> {
  if (radio.face === "current" || radio.face === "idle" || radio.face === "skip_pending") {
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    const start = radio.snapshotAt as number;
    const timer = setInterval(() => {
      if ((radio.snapshotAt as number) !== start || radio.face !== "catching_up") {
        clearInterval(timer);
        resolve();
      }
    }, 50);
    setTimeout(() => {
      clearInterval(timer);
      resolve();
    }, timeoutMs);
  });
}

export function disconnectSocket(): void {
  if (reconnectTimer != null) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  if (!socket) {
    radio.connected = false;
    return;
  }
  const ws = socket;
  socket = null;
  radio.connected = false;
  ws.close();
}
