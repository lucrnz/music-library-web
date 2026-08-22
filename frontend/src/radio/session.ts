/**
 * Radio face machine, load, and Media Session.
 * Socket I/O stays in runtime.ts. Chrome stays in stores/radio.ts.
 */
import { streamUrl } from "@/api";
import { SOURCE_TAG } from "@/lossyKind";
import { suspendMediaSession } from "@/playback/session";
import { needsReseek } from "@/radio/sync";
import {
  interpolatedPosition,
  radio,
  radioAudio,
  radioFailures,
  tuneIn,
  tuneOut,
} from "@/stores/radio";
import { getActiveStreamCodec } from "@/stores/settings";
import { showToast } from "@/stores/ui";

let lastLoadedTrackId: string | null = null;
let lastLoadedLossy: boolean | null = null;
let radioGen = 0;
let audioBound = false;

function isChromeActive(chrome: string): boolean {
  return chrome === "stopped" || chrome === "tuning" || chrome === "tuned";
}

export function bumpRadioGen(): void {
  radioGen += 1;
}

export function clearLoadedKeys(): void {
  lastLoadedTrackId = null;
  lastLoadedLossy = null;
}

export function maybeReseek(): void {
  if (radio.chrome !== "tuned") return;
  if (needsReseek(radioAudio.currentTime, interpolatedPosition())) {
    void radioAudio.seek(interpolatedPosition());
  }
}

export async function onFaceOrTrack(
  prevId: string | null,
  countsAsFailure = false,
): Promise<void> {
  bindAudioHandlers();
  if (!isChromeActive(radio.chrome)) return;
  if (radio.face === "idle" && (radio.chrome === "tuning" || radio.chrome === "tuned")) {
    tuneOut();
    return;
  }
  if (radio.face === "catching_up" || radio.face === "skip_pending") {
    if (radio.chrome === "tuned") radio.chrome = "tuning";
    radioAudio.stop();
    clearLoadedKeys();
    bumpRadioGen();
    return;
  }
  if (radio.face !== "current" || !radio.track?.id) return;
  if (radio.chrome === "stopped") {
    writeRadioMediaSession();
    return;
  }
  const changed =
    lastLoadedTrackId == null ||
    radio.track.id !== lastLoadedTrackId ||
    (lastLoadedLossy != null && lastLoadedLossy !== radio.isLossy) ||
    (prevId != null && radio.track.id !== prevId);
  if ((radio.chrome === "tuning" || radio.chrome === "tuned") && changed) {
    await loadCurrent(countsAsFailure);
  } else if (radio.chrome === "tuned") {
    maybeReseek();
  }
}

function streamCodecForLoad(): string {
  return radio.isLossy ? SOURCE_TAG : radio.tunerProfile || getActiveStreamCodec();
}

export async function loadCurrent(countsAsFailure: boolean): Promise<void> {
  const track = radio.track;
  if (!track?.id) return;
  const url = streamUrl(track, streamCodecForLoad());
  if (!url) return;
  const gen = ++radioGen;
  try {
    await radioAudio.load(url);
    if (gen !== radioGen) return;
    await radioAudio.seek(interpolatedPosition());
    if (gen !== radioGen) return;
    await radioAudio.play();
    if (gen !== radioGen) return;
    lastLoadedTrackId = track.id;
    lastLoadedLossy = radio.isLossy;
    radio.chrome = "tuned";
    writeRadioMediaSession();
  } catch {
    if (gen !== radioGen) return;
    if (countsAsFailure && radioFailures.record()) {
      showToast("Radio could not start — tuned out");
      tuneOut();
    }
  }
}

export function writeRadioMediaSession(): void {
  if (typeof navigator === "undefined" || !("mediaSession" in navigator)) return;
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
    if (!radioAudio.loadInFlight && !radioAudio.seekInFlight) tuneOut();
  });
  navigator.mediaSession.setActionHandler("stop", () => {
    tuneOut();
  });
  navigator.mediaSession.setActionHandler("previoustrack", null);
  navigator.mediaSession.setActionHandler("nexttrack", null);
  navigator.mediaSession.setActionHandler("seekto", null);
}

export function bindAudioHandlers(): void {
  if (audioBound) return;
  audioBound = true;
  radioAudio.onPause(() => {
    if (radio.chrome === "tuned" && !radioAudio.ended) tuneOut();
  });
  radioAudio.onEnded(() => {
    /* station clock owns advance */
  });
  radioAudio.onError(() => {
    if (radioFailures.record()) {
      showToast("Radio could not start — tuned out");
      tuneOut();
    }
  });
}
