/**
 * Radio chrome + façade. Socket lives in radio/runtime.ts.
 * Face/load live in radio/session.ts. Does not import player.ts.
 */
import { reactive, watch } from "vue";
import { fetchRadioNow } from "@/api";
import { fromApiTrack, type Track } from "@/models/track";
import { discard as discardListen } from "@/listens/bridge";
import { become, onLeaveRadio } from "@/playback/session";
import { player } from "@/stores/playerState";
import { createRadioAudio } from "@/radio/audio";
import { createRejoinClock } from "@/radio/rejoin";
import {
  bumpRadioGen,
  clearLoadedKeys,
  loadCurrent,
  maybeReseek,
  onFaceOrTrack,
  writeRadioMediaSession,
} from "@/radio/session";
import {
  disconnectSocket,
  openSocket,
  sendJson,
  sendTuneIn,
  socketRequired,
  waitForSnapshot,
} from "@/radio/runtime";
import { connectivity } from "@/stores/connectivity";
import type { PlayStatusState } from "@/playbackStatus";
import { subscribeOutputVolume } from "@/stores/playerPrefs";
import { getActiveStreamCodec, settings } from "@/stores/settings";
import { showToast } from "@/stores/ui";

export type RadioChrome = "inactive" | "stopped" | "tuning" | "tuned";
export type RadioFace = "catching_up" | "skip_pending" | "idle" | "current";
export type RadioPlaySource = "none" | "streaming" | "downloaded";

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
  playSource: RadioPlaySource;
  playProfileId: string | null;
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
  playSource: "none",
  playProfileId: null,
});

export const radioAudio = createRadioAudio();
const audio = radioAudio;

async function rejoinAttempt(): Promise<void> {
  if (radio.chrome !== "tuning") return;
  if (radio.connected) {
    const ok = await sendTuneIn();
    if (!ok) {
      rejoinClock.schedule();
      return;
    }
  } else {
    rejoinClock.schedule();
    return;
  }
  if (radio.face !== "current" || !radio.track?.id) return;
  await loadCurrent();
}

const rejoinClock = createRejoinClock(rejoinAttempt);

export function kickRadioRejoin(): void {
  rejoinClock.kick();
}

export function scheduleRadioRejoin(): void {
  rejoinClock.schedule();
}

export function cancelRadioRejoin(): void {
  rejoinClock.cancel();
}
let hydrateInFlight: Promise<void> | null = null;
let visibilityBound = false;
let sessionBound = false;
let radioListenersBound = false;

export function initRadioListeners(): void {
  if (radioListenersBound) return;
  radioListenersBound = true;
  subscribeOutputVolume((v) => audio.setVolume(v));
  watch(
    () => settings.streamCodec,
    () => {
      if (radioChromeActive()) void onStreamProfileChanged();
    },
  );
  watch(
    () => settings.playbackPolicy,
    () => {
      void onPlaybackPolicyChanged();
    },
  );
  watch(
    () => connectivity.state,
    (state) => {
      if (state === "online") {
        if (radio.chrome === "tuning") kickRadioRejoin();
        return;
      }
      if (radio.chrome === "tuning" || radio.chrome === "tuned") {
        radio.chrome = "tuning";
        audio.stop();
        clearLoadedKeys();
        bumpRadioGen();
      }
    },
  );
}

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
    playSource:
      radio.playSource === "streaming" || radio.playSource === "downloaded"
        ? radio.playSource
        : "streaming",
    playProfileId: radio.isLossy
      ? null
      : radio.playProfileId || radio.tunerProfile || getActiveStreamCodec(),
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

function bindSession(): void {
  if (sessionBound) return;
  sessionBound = true;
  onLeaveRadio(() => {
    leaveRadio();
  });
}

function leaveRadio(): void {
  if (radio.chrome === "inactive") return;
  cancelRadioRejoin();
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
  audio.setVolume(player.volume);
  const ok = await sendTuneIn();
  if (!ok) {
    scheduleRadioRejoin();
    return;
  }
  await onFaceOrTrack(null);
}

export function tuneOut(): void {
  if (radio.chrome === "inactive") return;
  cancelRadioRejoin();
  sendJson({ type: "tune_out" });
  audio.stop();
  clearLoadedKeys();
  bumpRadioGen();
  radio.chrome = "stopped";
  writeRadioMediaSession();
}

export async function onRadioSocketReconnect(): Promise<void> {
  await waitForSnapshot();
  if (radio.face === "current" && radioChromeActive()) {
    radio.chrome = "tuning";
    clearLoadedKeys();
    const ok = await sendTuneIn();
    if (!ok) {
      scheduleRadioRejoin();
      return;
    }
  }
  await onFaceOrTrack(null);
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

export async function onPlaybackPolicyChanged(): Promise<void> {
  if (radio.chrome !== "tuning" && radio.chrome !== "tuned") return;
  bumpRadioGen();
  clearLoadedKeys();
  await onFaceOrTrack(null);
}

function bindVisibility(): void {
  if (visibilityBound || typeof document === "undefined") return;
  visibilityBound = true;
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") maybeReseek();
  });
}

export function resetRadioStore(): void {
  cancelRadioRejoin();
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
  radio.playSource = "none";
  radio.playProfileId = null;
  clearLoadedKeys();
  bumpRadioGen();
}
