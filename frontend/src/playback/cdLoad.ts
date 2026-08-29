/**
 * CD transport. Does not import player.ts.
 */
import { showToast } from "@/stores/ui";
import { watch } from "vue";
import { cd, enterCdMode } from "@/stores/cd";
import { exclusiveAudio, isExclusiveArmed, isExclusiveEnabled } from "@/stores/exclusiveAudio";
import { bindCdRuntime } from "@/cd/runtime";
import { player, setPlayNotice, setPlaySourceState } from "@/stores/playerState";
import { activeSession } from "@/playback/session";
import { cdTrackUrl } from "@/playback/cdDelivery";
import { createCompanionSink } from "@/playback/sinks/companionSink";
import { PlayBlockError } from "@/playBlock";
import { ejectOptical } from "@/exclusive/opticalClient";
import { discard, onEnded, onTime, startCycle } from "@/listens/bridge";
import { isUnknownCdId } from "@/cd/identify";

const sink = createCompanionSink();
let loadedIndex = -1;
let loadedUrl = "";

function hogFlag(): boolean {
  return isExclusiveEnabled();
}

function bindHandlers(): void {
  sink.setHandlers({
    onTime(t, d) {
      if (activeSession() !== "cd") return;
      player.currentTime = t;
      if (d > 0) {
        player.duration = d;
        if (cd.face === "reading") cd.face = "playing";
      }
      onTime({ currentTime: t, duration: d > 0 ? d : null, playing: !player.paused });
    },
    onPauseState(paused) {
      if (activeSession() !== "cd") return;
      player.paused = paused;
    },
    onEnded() {
      if (activeSession() !== "cd") return;
      onEnded();
      void cdNext();
    },
    onError(err) {
      setPlayNotice(err.message);
      showToast(err.message);
      cd.face = "idle";
    },
  });
}

bindHandlers();

export async function cdLoad(index: number): Promise<void> {
  if (index < 0 || index >= cd.tracks.length) return;
  if (activeSession() !== "cd") enterCdMode();
  const track = cd.tracks[index];
  const deviceId = cd.selectedDriveId;
  const token = exclusiveAudio.companionToken;
  const port = exclusiveAudio.port || 18765;
  const trackNo = track.track || index + 1;
  let url: string;
  try {
    url = cdTrackUrl(port, token, deviceId || "", trackNo);
  } catch (err) {
    const block = err instanceof PlayBlockError ? err : new PlayBlockError("cd_not_ready");
    setPlayNotice(block.message);
    showToast(block.message);
    return;
  }
  cd.index = index;
  cd.face = "reading";
  player.paused = false;
  player.currentTime = 0;
  player.duration = 0;
  setPlaySourceState("cd", "cdda", null);
  try {
    discard();
    await sink.load(url, { hog: hogFlag() });
    loadedIndex = index;
    loadedUrl = url;
    if (!isUnknownCdId(track.id)) {
      startCycle({
        trackId: track.id,
        durationSec: track.duration,
        profile: "cdda",
        playSource: "cd",
        origin: "cd",
      });
    }
  } catch (err) {
    const block = err instanceof PlayBlockError ? err : new PlayBlockError("exclusive_failed");
    setPlaySourceState("unavailable", "cdda", block.reason);
    setPlayNotice(block.message);
    showToast(block.message);
    cd.face = "idle";
  }
}

export function cdPause(): void {
  sink.pause();
  player.paused = true;
}

export function cdResume(): void {
  sink.resume();
  player.paused = false;
}

export function cdToggle(): void {
  if (player.paused) cdResume();
  else cdPause();
}

export function cdSeek(seconds: number): void {
  sink.seek(seconds);
  player.currentTime = seconds;
}

export function cdStopTransport(): void {
  sink.stop();
  player.paused = true;
  loadedIndex = -1;
  loadedUrl = "";
  discard();
}

function nextIndex(delta: number): number {
  const n = cd.tracks.length;
  if (n <= 0) return -1;
  if (cd.repeat === "one" && delta !== 0) return cd.index;
  if (cd.shuffle && n > 1) {
    let pick = cd.index;
    while (pick === cd.index) pick = Math.floor(Math.random() * n);
    return pick;
  }
  const next = cd.index + delta;
  if (next < 0) return cd.repeat === "all" ? n - 1 : 0;
  if (next >= n) return cd.repeat === "all" ? 0 : -1;
  return next;
}

export async function cdNext(): Promise<void> {
  const next = nextIndex(1);
  if (next < 0) {
    cdPause();
    return;
  }
  await cdLoad(next);
}

export async function cdPrev(): Promise<void> {
  if (player.currentTime > 3) {
    cdSeek(0);
    return;
  }
  const next = nextIndex(-1);
  if (next < 0) return;
  await cdLoad(next);
}

export function cdSetShuffle(on: boolean): void {
  cd.shuffle = on;
}

export function cdCycleRepeat(): void {
  cd.repeat = cd.repeat === "off" ? "all" : cd.repeat === "all" ? "one" : "off";
}

export async function cdEject(): Promise<void> {
  cdStopTransport();
  const id = cd.selectedDriveId;
  if (!id) return;
  const ok = ejectOptical(id);
  if (!ok) {
    showToast("Eject failed");
  }
}

export async function reloadCdAtPosition(): Promise<void> {
  if (activeSession() !== "cd" || loadedIndex < 0 || !loadedUrl) return;
  const pos = player.currentTime;
  const wasPaused = player.paused;
  try {
    await sink.load(loadedUrl, { hog: hogFlag() });
    if (pos > 0) cdSeek(pos);
    if (wasPaused) cdPause();
  } catch (err) {
    const block = err instanceof PlayBlockError ? err : new PlayBlockError("exclusive_failed");
    showToast(block.message);
  }
}

export function installCdMediaSession(): void {
  if (typeof navigator === "undefined" || !("mediaSession" in navigator)) return;
  navigator.mediaSession.setActionHandler("play", () => {
    cdResume();
  });
  navigator.mediaSession.setActionHandler("pause", () => {
    cdPause();
  });
  navigator.mediaSession.setActionHandler("previoustrack", () => {
    void cdPrev();
  });
  navigator.mediaSession.setActionHandler("nexttrack", () => {
    void cdNext();
  });
  navigator.mediaSession.setActionHandler("seekto", (details) => {
    if (details.seekTime != null) cdSeek(details.seekTime);
  });
  navigator.mediaSession.setActionHandler("stop", () => {
    cdPause();
  });
}

export function initCdListeners(): void {
  bindCdRuntime(installCdMediaSession, cdStopTransport);
  watch(
    () => [
      exclusiveAudio.enabled,
      exclusiveAudio.selectedDeviceId,
      isExclusiveArmed(),
    ],
    () => {
      if (activeSession() === "cd") void reloadCdAtPosition();
    },
  );
}
