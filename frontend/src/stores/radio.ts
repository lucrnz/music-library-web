/**
 * Radio chrome + façade. Owns the household station socket.
 * Does not import player.ts.
 */
import { reactive, watch } from "vue";
import { fetchRadioNow, streamUrl } from "@/api";
import { SOURCE_TAG } from "@/lossyKind";
import { fromApiTrack, type Track } from "@/models/track";
import { discard as discardListen } from "@/listens/bridge";
import {
  restoreMediaSession,
  setOnDemandClaimHook,
  stopOnDemandSinks,
  suspendMediaSession,
} from "@/playback/onDemandControl";
import { player } from "@/stores/playerState";
import { createRadioAudio } from "@/radio/audio";
import { createFailureCap } from "@/radio/failures";
import { needsReseek } from "@/radio/sync";
import { connectivity } from "@/stores/connectivity";
import type { ExclusiveFaceSnapshot } from "@/exclusive/statusFace";
import type { PlayStatusState } from "@/playbackStatus";
import { readVolume } from "@/stores/playerPrefs";
import { getActiveStreamCodec } from "@/stores/settings";
import { showToast } from "@/stores/ui";

export type RadioChrome = "inactive" | "preview" | "stopped" | "tuning" | "tuned";
export type RadioFace = "catching_up" | "skip_pending" | "idle" | "current";

export interface RadioStore {
  chrome: RadioChrome;
  face: RadioFace;
  track: Track | null;
  isLossy: boolean;
  snapshotPosition: number;
  snapshotAt: number;
  officialDuration: number;
  connected: boolean;
  tabOpen: boolean;
  tunerProfile: string | null;
}

export const radio = reactive<RadioStore>({
  chrome: "inactive",
  face: "idle",
  track: null,
  isLossy: false,
  snapshotPosition: 0,
  snapshotAt: 0,
  officialDuration: 0,
  connected: false,
  tabOpen: false,
  tunerProfile: null,
});

const audio = createRadioAudio();
const failures = createFailureCap();
let socket: WebSocket | null = null;
let pendingAck: ((value: TuneAck) => void) | null = null;
let hydrateInFlight: Promise<void> | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let lastLoadedTrackId: string | null = null;
let lastLoadedLossy: boolean | null = null;
let connectivityBound = false;
let visibilityBound = false;
let volumeBound = false;
let claimHookBound = false;

interface TuneAck {
  ok: boolean;
  error?: string;
  face?: string;
}

export function radioChromeActive(): boolean {
  return radio.chrome === "stopped" || radio.chrome === "tuning" || radio.chrome === "tuned";
}

export function radioSubtitle(track: Track | null | undefined): string {
  if (!track) return "";
  return [track.artist, track.album].filter(Boolean).join(" — ");
}

/** HTML radio is never exclusive; do not let Settings hog-enabled relabel the badge. */
export const RADIO_EXCLUSIVE_SNAP: ExclusiveFaceSnapshot = {
  enabled: false,
  connection: "disconnected",
  role: null,
  preferenceId: null,
  liveId: null,
};

export function radioPlayState(): PlayStatusState {
  return {
    playSource: "streaming",
    playProfileId: radio.isLossy
      ? null
      : radio.tunerProfile || getActiveStreamCodec(),
    track: radio.track,
  };
}

export function interpolatedPosition(now = performance.now()): number {
  if (radio.face !== "current") return 0;
  const elapsed = (now - radio.snapshotAt) / 1000;
  const pos = radio.snapshotPosition + elapsed;
  const dur = radio.officialDuration;
  if (dur > 0) return Math.max(0, Math.min(pos, dur));
  return Math.max(0, pos);
}

export function heardPosition(now = performance.now()): number {
  if (radio.chrome === "tuned") return audio.currentTime;
  return interpolatedPosition(now);
}

export function applySnapshot(raw: unknown, now = performance.now()): void {
  if (!raw || typeof raw !== "object") return;
  const rec = raw as Record<string, unknown>;
  if ("ok" in rec && rec.face == null && rec.id == null) return;
  const face = rec.face;
  if (
    face !== "catching_up" &&
    face !== "skip_pending" &&
    face !== "idle" &&
    face !== "current"
  ) {
    return;
  }
  const prevId = radio.track?.id ?? null;
  radio.face = face;
  const id = rec.id;
  if (face === "current" && id != null && String(id).length > 0) {
    radio.track = fromApiTrack(raw);
    radio.isLossy = radio.track.isLossy;
    radio.officialDuration = radio.track.duration ?? 0;
    const pos = Number(rec.position);
    radio.snapshotPosition = Number.isFinite(pos) ? pos : 0;
    radio.snapshotAt = now;
  } else {
    radio.track = null;
    radio.isLossy = false;
    radio.officialDuration = 0;
    radio.snapshotPosition = 0;
    radio.snapshotAt = now;
  }
  void onFaceOrTrack(prevId);
}

async function onFaceOrTrack(prevId: string | null): Promise<void> {
  if (radio.chrome !== "tuning" && radio.chrome !== "tuned" && radio.chrome !== "stopped") {
    return;
  }
  if (radio.face === "idle" && (radio.chrome === "tuning" || radio.chrome === "tuned")) {
    tuneOut();
    return;
  }
  if (radio.face === "catching_up" || radio.face === "skip_pending") {
    if (radio.chrome === "tuned") radio.chrome = "tuning";
    audio.stop();
    lastLoadedTrackId = null;
    return;
  }
  if (radio.face !== "current" || !radio.track?.id) return;
  if (radio.chrome === "stopped") {
    writeRadioMediaSession();
    return;
  }
  if (radio.chrome === "tuning" && lastLoadedTrackId == null) {
    await sendTuneIn();
    if (radio.chrome === "tuning") await loadCurrent(false);
    return;
  }
  const changed = radio.track.id !== prevId && prevId != null;
  const lossyFlip = lastLoadedLossy != null && lastLoadedLossy !== radio.isLossy;
  if ((changed || lossyFlip) && (radio.chrome === "tuning" || radio.chrome === "tuned")) {
    await loadCurrent(false);
  } else if (radio.chrome === "tuned") {
    maybeReseek();
  }
}

function streamCodecForLoad(): string {
  return radio.isLossy ? SOURCE_TAG : radio.tunerProfile || getActiveStreamCodec();
}

export function tuneInCodec(): string {
  return getActiveStreamCodec();
}

async function loadCurrent(countsAsFailure: boolean): Promise<void> {
  const track = radio.track;
  if (!track?.id) return;
  const url = streamUrl(track, streamCodecForLoad());
  if (!url) return;
  try {
    await audio.load(url);
    await audio.seek(interpolatedPosition());
    await audio.play();
    lastLoadedTrackId = track.id;
    lastLoadedLossy = radio.isLossy;
    radio.chrome = "tuned";
    writeRadioMediaSession();
  } catch {
    if (countsAsFailure && failures.record()) {
      showToast("Radio could not start — tuned out");
      tuneOut();
    }
  }
}

function maybeReseek(): void {
  if (radio.chrome !== "tuned") return;
  if (needsReseek(audio.currentTime, interpolatedPosition())) {
    void audio.seek(interpolatedPosition());
  }
}

function writeRadioMediaSession(): void {
  if (typeof navigator === "undefined" || !("mediaSession" in navigator)) return;
  suspendMediaSession();
  const t = radio.track;
  navigator.mediaSession.metadata = t
    ? new MediaMetadata({
        title: t.title,
        artist: t.artist,
        album: t.album,
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
  return radio.tabOpen || radioChromeActive();
}

function openSocket(): void {
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
    await sendTuneIn();
    if (radio.chrome === "tuning") await loadCurrent(false);
  }
}

function sendJson(msg: object): void {
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

async function sendTuneIn(): Promise<boolean> {
  const codec = getActiveStreamCodec();
  radio.tunerProfile = codec;
  const ack = await sendAndWait({ type: "tune_in", codec });
  return ack.ok === true;
}

function waitForSnapshot(timeoutMs = 4000): Promise<void> {
  if (radio.face === "current" || radio.face === "idle" || radio.face === "skip_pending") {
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    const start = radio.snapshotAt;
    const timer = setInterval(() => {
      if (radio.snapshotAt !== start || radio.face !== "catching_up") {
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

function bindVolumeWatch(): void {
  if (volumeBound) return;
  volumeBound = true;
  watch(
    () => player.volume,
    (v) => {
      audio.setVolume(v);
    },
  );
}

function bindClaimHook(): void {
  if (claimHookBound) return;
  claimHookBound = true;
  setOnDemandClaimHook(() => {
    exitToQueue();
  });
}

export async function connect(): Promise<void> {
  if (radio.chrome === "inactive") radio.chrome = "preview";
  bindClaimHook();
  bindVolumeWatch();
  bindConnectivity();
  bindVisibility();
  if (!hydrateInFlight) {
    hydrateInFlight = (async () => {
      try {
        applySnapshot(await fetchRadioNow());
      } catch {
        /* WS will fill in */
      }
    })().finally(() => {
      hydrateInFlight = null;
    });
  }
  await hydrateInFlight;
  openSocket();
}

export function disconnect(): void {
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

function maybeDisconnect(): void {
  if (!socketRequired()) disconnect();
}

export function setTabOpen(open: boolean): void {
  radio.tabOpen = open;
  if (open) void connect();
  else maybeDisconnect();
}

export async function tuneIn(): Promise<void> {
  if (radio.chrome === "inactive" || radio.chrome === "preview") {
    radio.chrome = "stopped";
  }
  await connect();
  await waitForSnapshot();
  if (radio.face !== "current" || !radio.track?.id) {
    showToast("Radio is not on air yet");
    return;
  }
  suspendMediaSession();
  stopOnDemandSinks();
  discardListen();
  radio.chrome = "tuning";
  audio.setVolume(readVolume() ?? 1);
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
  const ok = await sendTuneIn();
  if (!ok) {
    showToast("Could not tune in");
    radio.chrome = "stopped";
    writeRadioMediaSession();
    return;
  }
  await loadCurrent(true);
}

export function tuneOut(): void {
  if (radio.chrome === "inactive" || radio.chrome === "preview") return;
  sendJson({ type: "tune_out" });
  audio.stop();
  lastLoadedTrackId = null;
  lastLoadedLossy = null;
  radio.chrome = "stopped";
  writeRadioMediaSession();
}

export function exitToQueue(): void {
  if (radio.chrome === "inactive") return;
  if (radioChromeActive()) sendJson({ type: "tune_out" });
  audio.stop();
  lastLoadedTrackId = null;
  lastLoadedLossy = null;
  radio.tunerProfile = null;
  radio.chrome = "inactive";
  restoreMediaSession();
  maybeDisconnect();
}

export function setVolume(v: number): void {
  audio.setVolume(v);
}

export async function onStreamProfileChanged(): Promise<void> {
  if (!radioChromeActive()) return;
  const profile = getActiveStreamCodec();
  radio.tunerProfile = profile;
  const ok = await sendTuneIn();
  if (!ok) return;
  if (!radio.isLossy && radio.chrome !== "stopped") {
    await loadCurrent(false);
  }
}

function bindConnectivity(): void {
  if (connectivityBound) return;
  connectivityBound = true;
  watch(
    () => connectivity.state,
    (state) => {
      if (state === "online") return;
      if (radio.chrome === "tuning" || radio.chrome === "tuned") {
        tuneOut();
        showToast("Connection lost — tuned out");
      }
    },
  );
}

function bindVisibility(): void {
  if (visibilityBound || typeof document === "undefined") return;
  visibilityBound = true;
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") maybeReseek();
  });
}

export function resetRadioStore(): void {
  disconnect();
  audio.stop();
  radio.chrome = "inactive";
  radio.face = "idle";
  radio.track = null;
  radio.isLossy = false;
  radio.snapshotPosition = 0;
  radio.snapshotAt = 0;
  radio.officialDuration = 0;
  radio.tabOpen = false;
  radio.tunerProfile = null;
  lastLoadedTrackId = null;
  lastLoadedLossy = null;
  failures.reset();
}
