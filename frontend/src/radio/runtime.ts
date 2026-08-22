/**
 * Radio socket, load generation, and Media Session writes.
 * Chrome face stays in stores/radio.ts.
 */
import { streamUrl } from "@/api";
import { SOURCE_TAG } from "@/lossyKind";
import { suspendMediaSession } from "@/playback/session";
import type { RadioAudio } from "@/radio/audio";
import { createFailureCap } from "@/radio/failures";
import { getActiveStreamCodec } from "@/stores/settings";
import { showToast } from "@/stores/ui";

export interface RadioRuntimeHost {
  radio: {
    chrome: string;
    face: string;
    track: { id?: string; title?: string; artist?: string; album?: string } | null;
    isLossy: boolean;
    tunerProfile: string | null;
    connected: boolean;
    tabOpen: boolean;
    snapshotAt: number;
  };
  audio: RadioAudio;
  failures: ReturnType<typeof createFailureCap>;
  radioChromeActive: () => boolean;
  interpolatedPosition: () => number;
  applySnapshot: (raw: unknown) => void;
  onFaceOrTrack: (prevId: string | null, countsAsFailure?: boolean) => Promise<void>;
  tuneIn: () => Promise<void>;
  tuneOut: () => void;
}

interface TuneAck {
  ok: boolean;
  error?: string;
  face?: string;
}

let host: RadioRuntimeHost | null = null;
let socket: WebSocket | null = null;
let pendingAck: ((value: TuneAck) => void) | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let lastLoadedTrackId: string | null = null;
let lastLoadedLossy: boolean | null = null;
let radioGen = 0;
let audioBound = false;

export function initRadioRuntime(next: RadioRuntimeHost): void {
  host = next;
  bindAudioHandlers();
}

export function bumpRadioGen(): void {
  radioGen += 1;
}

export function clearLoadedKeys(): void {
  lastLoadedTrackId = null;
  lastLoadedLossy = null;
}

export function currentLoadKeys(): {
  lastLoadedTrackId: string | null;
  lastLoadedLossy: boolean | null;
} {
  return { lastLoadedTrackId, lastLoadedLossy };
}

function requireHost(): RadioRuntimeHost {
  if (!host) throw new Error("radio runtime not initialized");
  return host;
}

function streamCodecForLoad(): string {
  const { radio } = requireHost();
  return radio.isLossy ? SOURCE_TAG : radio.tunerProfile || getActiveStreamCodec();
}

export async function loadCurrent(countsAsFailure: boolean): Promise<void> {
  const { radio, audio, failures, interpolatedPosition, tuneOut } = requireHost();
  const track = radio.track;
  if (!track?.id) return;
  const url = streamUrl(track, streamCodecForLoad());
  if (!url) return;
  const gen = ++radioGen;
  try {
    await audio.load(url);
    if (gen !== radioGen) return;
    await audio.seek(interpolatedPosition());
    if (gen !== radioGen) return;
    await audio.play();
    if (gen !== radioGen) return;
    lastLoadedTrackId = track.id;
    lastLoadedLossy = radio.isLossy;
    radio.chrome = "tuned";
    writeRadioMediaSession();
  } catch {
    if (gen !== radioGen) return;
    if (countsAsFailure && failures.record()) {
      showToast("Radio could not start — tuned out");
      tuneOut();
    }
  }
}

export function writeRadioMediaSession(): void {
  if (typeof navigator === "undefined" || !("mediaSession" in navigator)) return;
  const { radio, audio, tuneIn, tuneOut } = requireHost();
  suspendMediaSession();
  const t = radio.track;
  navigator.mediaSession.metadata = t
    ? new MediaMetadata({
        title: t.title || "",
        artist: t.artist || "",
        album: t.album || "",
      })
    : null;
  navigator.mediaSession.setActionHandler("play", () => {
    void tuneIn();
  });
  navigator.mediaSession.setActionHandler("pause", () => {
    if (!audio.loadInFlight && !audio.seekInFlight) tuneOut();
  });
  navigator.mediaSession.setActionHandler("stop", () => {
    tuneOut();
  });
  navigator.mediaSession.setActionHandler("previoustrack", null);
  navigator.mediaSession.setActionHandler("nexttrack", null);
  navigator.mediaSession.setActionHandler("seekto", null);
}

function radioWsUrl(): string {
  const proto = location.protocol === "https:" ? "wss:" : "ws:";
  return `${proto}//${location.host}/api/radio/ws`;
}

function socketRequired(): boolean {
  const { radio, radioChromeActive } = requireHost();
  return radio.tabOpen || radioChromeActive();
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
  const { radio, applySnapshot } = requireHost();
  const ws = new WebSocket(radioWsUrl());
  socket = ws;
  radio.connected = true;
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
  const { radio, radioChromeActive, onFaceOrTrack, tuneOut } = requireHost();
  await waitForSnapshot();
  if (radio.face === "idle") {
    tuneOut();
    return;
  }
  if (radio.face === "catching_up" || radio.face === "skip_pending") {
    if (radioChromeActive()) radio.chrome = "tuning";
    return;
  }
  if (radio.face === "current" && radioChromeActive()) {
    radio.chrome = "tuning";
    lastLoadedTrackId = null;
    const ok = await sendTuneIn();
    if (ok) await onFaceOrTrack(null);
  }
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
  const { radio } = requireHost();
  const codec = getActiveStreamCodec();
  radio.tunerProfile = codec;
  const ack = await sendAndWait({ type: "tune_in", codec });
  return ack.ok === true;
}

export function waitForSnapshot(timeoutMs = 4000): Promise<void> {
  const { radio } = requireHost();
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
  const { radio } = requireHost();
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

function bindAudioHandlers(): void {
  if (audioBound || !host) return;
  audioBound = true;
  const { audio, failures, tuneOut, radio } = host;
  audio.onPause(() => {
    if (radio.chrome === "tuned" && !audio.ended) tuneOut();
  });
  audio.onEnded(() => {
    /* station clock owns advance */
  });
  audio.onError(() => {
    if (failures.record()) {
      showToast("Radio could not start — tuned out");
      tuneOut();
    }
  });
}
