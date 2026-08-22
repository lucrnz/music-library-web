/**
 * Radio chrome + façade. Owns the household station socket.
 * Does not import player.ts.
 */
import { reactive, watch } from "vue";
import { fetchRadioNow } from "@/api";
import { fromApiTrack, type Track } from "@/models/track";
import { discard as discardListen } from "@/listens/bridge";
import { become, onLeaveRadio } from "@/playback/session";
import { player } from "@/stores/playerState";
import { createRadioAudio } from "@/radio/audio";
import { createFailureCap } from "@/radio/failures";
import {
  bumpRadioGen,
  clearLoadedKeys,
  currentLoadKeys,
  disconnectSocket,
  initRadioRuntime,
  loadCurrent,
  openSocket,
  sendJson,
  sendTuneIn,
  waitForSnapshot,
  writeRadioMediaSession,
} from "@/radio/runtime";
import { needsReseek } from "@/radio/sync";
import { connectivity } from "@/stores/connectivity";
import type { PlayStatusState } from "@/playbackStatus";
import { readVolume } from "@/stores/playerPrefs";
import { getActiveStreamCodec, settings } from "@/stores/settings";
import { showToast } from "@/stores/ui";

export type RadioChrome = "inactive" | "stopped" | "tuning" | "tuned";
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
let hydrateInFlight: Promise<void> | null = null;
let connectivityBound = false;
let visibilityBound = false;
let volumeBound = false;
let sessionBound = false;

export function radioChromeActive(): boolean {
  return radio.chrome === "stopped" || radio.chrome === "tuning" || radio.chrome === "tuned";
}

export function radioSubtitle(track: Track | null | undefined): string {
  if (!track) return "";
  return [track.artist, track.album].filter(Boolean).join(" — ");
}

export function radioPlayState(): PlayStatusState {
  return {
    session: "radio",
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

async function onFaceOrTrack(
  prevId: string | null,
  countsAsFailure = false,
): Promise<void> {
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
    clearLoadedKeys();
    bumpRadioGen();
    return;
  }
  if (radio.face !== "current" || !radio.track?.id) return;
  if (radio.chrome === "stopped") {
    writeRadioMediaSession();
    return;
  }
  const keys = currentLoadKeys();
  const changed =
    keys.lastLoadedTrackId == null ||
    radio.track.id !== keys.lastLoadedTrackId ||
    (keys.lastLoadedLossy != null && keys.lastLoadedLossy !== radio.isLossy) ||
    (prevId != null && radio.track.id !== prevId);
  if ((radio.chrome === "tuning" || radio.chrome === "tuned") && changed) {
    await loadCurrent(countsAsFailure);
  } else if (radio.chrome === "tuned") {
    maybeReseek();
  }
}

export function tuneInCodec(): string {
  return getActiveStreamCodec();
}

function maybeReseek(): void {
  if (radio.chrome !== "tuned") return;
  if (needsReseek(audio.currentTime, interpolatedPosition())) {
    void audio.seek(interpolatedPosition());
  }
}

function socketRequired(): boolean {
  return radio.tabOpen || radioChromeActive();
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
  watch(
    () => settings.streamCodec,
    () => {
      if (radioChromeActive()) void onStreamProfileChanged();
    },
  );
}

function bindSession(): void {
  if (sessionBound) return;
  sessionBound = true;
  onLeaveRadio(() => {
    leaveRadio();
  });
}

function leaveRadio(): void {
  if (radio.chrome === "inactive") return;
  if (radioChromeActive()) sendJson({ type: "tune_out" });
  audio.stop();
  clearLoadedKeys();
  bumpRadioGen();
  radio.tunerProfile = null;
  radio.chrome = "inactive";
  maybeDisconnect();
}

export async function connect(): Promise<void> {
  bindSession();
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
  disconnectSocket();
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
  if (radio.chrome === "inactive") {
    radio.chrome = "stopped";
  }
  await connect();
  await waitForSnapshot();
  if (radio.face !== "current" || !radio.track?.id) {
    showToast("Radio is not on air yet");
    return;
  }
  become("radio");
  discardListen();
  radio.chrome = "tuning";
  clearLoadedKeys();
  audio.setVolume(readVolume() ?? 1);
  const ok = await sendTuneIn();
  if (!ok) {
    showToast("Could not tune in");
    radio.chrome = "stopped";
    writeRadioMediaSession();
    return;
  }
  await onFaceOrTrack(null, true);
}

export function tuneOut(): void {
  if (radio.chrome === "inactive") return;
  sendJson({ type: "tune_out" });
  audio.stop();
  clearLoadedKeys();
  bumpRadioGen();
  radio.chrome = "stopped";
  writeRadioMediaSession();
}

export async function onStreamProfileChanged(): Promise<void> {
  if (!radioChromeActive()) return;
  const profile = getActiveStreamCodec();
  radio.tunerProfile = profile;
  const ok = await sendTuneIn();
  if (!ok) return;
  if (!radio.isLossy && radio.chrome !== "stopped") {
    clearLoadedKeys();
    await onFaceOrTrack(null);
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
  clearLoadedKeys();
  bumpRadioGen();
  failures.reset();
}

initRadioRuntime({
  radio,
  audio,
  failures,
  radioChromeActive,
  interpolatedPosition,
  applySnapshot,
  onFaceOrTrack,
  tuneIn,
  tuneOut,
});
