/**
 * CD transport. Does not import player.ts.
 */
import { showToast } from "@/stores/ui";
import { watch } from "vue";
import { coverUrl } from "@/api";
import { cd, enterCdMode, refreshCdFace } from "@/stores/cd";
import { exclusiveAudio, isExclusiveArmed, isExclusiveEnabled } from "@/stores/exclusiveAudio";
import { subscribeOutputVolume } from "@/stores/playerPrefs";
import { bindCdRuntime } from "@/cd/runtime";
import { player, setPlayNotice, setPlaySourceState } from "@/stores/playerState";
import { activeSession } from "@/playback/session";
import { cdromFileUrl, cdTrackUrl } from "@/playback/cdDelivery";
import { createCompanionSink } from "@/playback/sinks/companionSink";
import { PlayBlockError } from "@/playBlock";
import { ejectOptical, watchOptical } from "@/exclusive/opticalClient";
import { cdromCoverUrl, cdromRelOf, isCdromTrack, VA_ARTIST_THUMB } from "@/cd/cdrom";

const sink = createCompanionSink();
let loadedIndex = -1;
let loadedUrl = "";
let loadGen = 0;

function hogFlag(): boolean {
  return isExclusiveEnabled();
}

function attachHandlers(gen: number): void {
  sink.setHandlers({
    onTime(t, d) {
      if (gen !== loadGen || activeSession() !== "cd") return;
      player.currentTime = t;
      if (d > 0) {
        player.duration = d;
        if (cd.face === "reading") cd.face = "playing";
      }
      updateCdPositionState();
    },
    onPauseState(paused) {
      if (gen !== loadGen || activeSession() !== "cd") return;
      player.paused = paused;
      if (typeof navigator !== "undefined" && "mediaSession" in navigator) {
        navigator.mediaSession.playbackState = paused ? "paused" : "playing";
      }
    },
    onEnded() {
      if (gen !== loadGen || activeSession() !== "cd") return;
      void cdNext();
    },
    onError(err) {
      if (gen !== loadGen) return;
      loadGen += 1;
      setPlayNotice(err.message);
      showToast(err.message);
      if (activeSession() === "cd" && isCdromTrack(cd.tracks[cd.index])) {
        void cdAdvanceAfterError();
        return;
      }
      cdStopTransport();
      if (cd.enabled && cd.selectedDriveId && activeSession() === "cd") {
        watchOptical(false);
        watchOptical(true, cd.selectedDriveId);
      }
      refreshCdFace();
    },
  });
}

attachHandlers(0);

export async function cdLoad(index: number): Promise<void> {
  if (index < 0 || index >= cd.tracks.length) return;
  const gen = ++loadGen;
  attachHandlers(gen);
  if (activeSession() !== "cd") enterCdMode();
  const track = cd.tracks[index];
  const deviceId = cd.selectedDriveId;
  const token = exclusiveAudio.companionToken;
  const port = exclusiveAudio.port || 18765;
  const data = isCdromTrack(track);
  const profile = data ? "cdrom" : "cdda";
  let url: string;
  try {
    url = data
      ? cdromFileUrl(port, token, deviceId || "", cdromRelOf(track))
      : cdTrackUrl(port, token, deviceId || "", track.track || index + 1);
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
  setPlaySourceState("cd", profile, null);
  try {
    await sink.load(url, { hog: hogFlag() });
    if (gen !== loadGen) return;
    sink.setVolume(player.volume);
    loadedIndex = index;
    loadedUrl = url;
    writeCdMediaSession();
  } catch (err) {
    if (gen !== loadGen) return;
    const block = err instanceof PlayBlockError ? err : new PlayBlockError("exclusive_failed");
    setPlaySourceState("unavailable", profile, block.reason);
    setPlayNotice(block.message);
    showToast(block.message);
    if (data) {
      await cdAdvanceAfterError();
      return;
    }
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
  loadGen += 1;
  sink.stop();
  player.paused = true;
  loadedIndex = -1;
  loadedUrl = "";
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

function nextIndexAfterError(): number {
  const n = cd.tracks.length;
  if (n <= 0) return -1;
  const next = cd.index + 1;
  return next >= n ? -1 : next;
}

async function cdAdvanceAfterError(): Promise<void> {
  const next = nextIndexAfterError();
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
    sink.setVolume(player.volume);
    if (pos > 0) {
      await waitForSinkDuration();
      if (sink.duration > 0) cdSeek(pos);
    }
    if (wasPaused) cdPause();
  } catch (err) {
    const block = err instanceof PlayBlockError ? err : new PlayBlockError("exclusive_failed");
    showToast(block.message);
  }
}

function waitForSinkDuration(): Promise<void> {
  if (sink.duration > 0) return Promise.resolve();
  const wait = sink.waitForDuration?.() ?? Promise.resolve();
  return Promise.race([
    wait,
    new Promise<void>((resolve) => {
      window.setTimeout(resolve, 3000);
    }),
  ]);
}

function writeCdMediaSession(): void {
  if (typeof navigator === "undefined" || !("mediaSession" in navigator)) return;
  if (activeSession() !== "cd") return;
  const track = cd.index >= 0 ? cd.tracks[cd.index] : null;
  const dataDisc = cd.mediaKind === "data" || (track != null && isCdromTrack(track));
  const artwork = track && isCdromTrack(track)
    ? cdromCoverUrl(track)
    : track?.albumId
      ? coverUrl(track, "full", false)
      : dataDisc
        ? VA_ARTIST_THUMB
        : "/static/img/audio-cd.svg";
  navigator.mediaSession.metadata = new MediaMetadata({
    title: track?.title || (dataDisc ? cd.volumeName || "Data CD" : "Audio CD"),
    artist: track?.artist || "",
    album: track?.album || (dataDisc ? cd.volumeName || "Data CD" : "Audio CD"),
    artwork: [{ src: artwork, sizes: "512x512", type: "image/png" }],
  });
  navigator.mediaSession.playbackState = player.paused ? "paused" : "playing";
}

function updateCdPositionState(): void {
  if (typeof navigator === "undefined" || !("mediaSession" in navigator)) return;
  if (activeSession() !== "cd") return;
  if (!(player.duration > 0)) return;
  try {
    navigator.mediaSession.setPositionState({
      duration: player.duration,
      position: Math.min(player.currentTime, player.duration),
      playbackRate: 1,
    });
  } catch {
    /* ignore engines that reject position */
  }
}

export function installCdMediaSession(): void {
  if (typeof navigator === "undefined" || !("mediaSession" in navigator)) return;
  writeCdMediaSession();
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
  subscribeOutputVolume((v) => {
    if (activeSession() === "cd") sink.setVolume(v);
  });
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
  watch(
    () => exclusiveAudio.connection,
    () => {
      if (activeSession() !== "cd") return;
      if (
        exclusiveAudio.connection === "disconnected" ||
        exclusiveAudio.connection === "rejected"
      ) {
        cdStopTransport();
        refreshCdFace();
      }
    },
  );
}
