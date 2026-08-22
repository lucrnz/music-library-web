/**
 * Radio face machine, load, and Media Session.
 * Socket I/O stays in runtime.ts. Chrome stays in stores/radio.ts.
 */
import { streamUrl } from "@/api";
import { markTrackBroken } from "@/downloads/catalog";
import { resolvePlaySource } from "@/downloads/resolve";
import { downloads } from "@/downloads/state";
import {
  discard as discardListen,
  onEnded as onListenEnded,
  onTime as onListenTime,
  startCycle as startListenCycle,
} from "@/listens/bridge";
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
import { getActiveStreamCodec, settings } from "@/stores/settings";
import { showToast } from "@/stores/ui";

let lastLoadedTrackId: string | null = null;
let lastLoadedLossy: boolean | null = null;
let radioGen = 0;
let audioBound = false;
let localRadioUrl: string | null = null;

function isChromeActive(chrome: string): boolean {
  return chrome === "stopped" || chrome === "tuning" || chrome === "tuned";
}

export function bumpRadioGen(): void {
  radioGen += 1;
}

export function revokeRadioLocalUrl(): void {
  if (!localRadioUrl) return;
  URL.revokeObjectURL(localRadioUrl);
  localRadioUrl = null;
}

export function clearLoadedKeys(): void {
  lastLoadedTrackId = null;
  lastLoadedLossy = null;
  revokeRadioLocalUrl();
  radio.playSource = "none";
  discardListen();
}

export function maybeReseek(): void {
  if (radio.chrome !== "tuned") return;
  const official = interpolatedPosition();
  const el = radioAudio.el;
  if (
    el &&
    Number.isFinite(el.duration) &&
    el.duration > 0 &&
    official >= el.duration
  ) {
    return;
  }
  if (needsReseek(radioAudio.currentTime, official)) {
    void radioAudio.seek(official);
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

type RadioDelivery =
  | { source: "unavailable" }
  | { source: "streaming" | "downloaded"; url: string; profile: string | null };

async function resolveRadioDelivery(
  track: { id: string; title?: string },
  localBroken: boolean,
): Promise<RadioDelivery> {
  if (localBroken) {
    const codec = streamCodecForLoad();
    const url = streamUrl(track, codec);
    if (!url) return { source: "unavailable" };
    return { source: "streaming", url, profile: codec };
  }
  const resolved = await resolvePlaySource(track, {
    enabled: downloads.enabled,
    offline: false,
    activeStreamCodec: streamCodecForLoad(),
    playbackPolicy: settings.playbackPolicy,
    catalog: settings.options,
  });
  if (resolved.source === "unavailable") return { source: "unavailable" };
  return resolved;
}

function rememberDelivery(
  source: "streaming" | "downloaded",
  profile: string | null,
): void {
  radio.playSource = source;
  radio.playProfileId = radio.isLossy ? null : profile;
}

function failTuneIn(countsAsFailure: boolean): void {
  if (countsAsFailure && radioFailures.record()) {
    showToast("Radio could not start — tuned out");
    tuneOut();
  }
}

async function loadResolvedRadio(
  track: { id: string; title?: string },
  gen: number,
  countsAsFailure: boolean,
  localBroken: boolean,
): Promise<void> {
  const resolved = await resolveRadioDelivery(track, localBroken);
  if (gen !== radioGen) return;
  if (resolved.source === "unavailable") {
    failTuneIn(countsAsFailure);
    return;
  }
  const prevBlob = localRadioUrl;
  localRadioUrl = resolved.source === "downloaded" ? resolved.url : null;
  try {
    await radioAudio.load(resolved.url);
    if (prevBlob && prevBlob !== localRadioUrl) {
      URL.revokeObjectURL(prevBlob);
    }
    if (gen !== radioGen) return;
    await radioAudio.seek(interpolatedPosition());
    if (gen !== radioGen) return;
    await radioAudio.play();
    if (gen !== radioGen) return;
    rememberDelivery(resolved.source, resolved.profile);
    lastLoadedTrackId = track.id;
    lastLoadedLossy = radio.isLossy;
    radio.chrome = "tuned";
    if (resolved.profile) {
      startListenCycle({
        trackId: track.id,
        durationSec: radio.track?.duration ?? null,
        profile: resolved.profile,
        playSource: resolved.source,
        origin: "radio",
      });
    }
    writeRadioMediaSession();
  } catch {
    if (gen !== radioGen) return;
    if (resolved.source === "downloaded" && !localBroken) {
      console.warn("Local radio playback failed, falling back to stream");
      markTrackBroken(track.id).catch(() => {});
      revokeRadioLocalUrl();
      return loadResolvedRadio(track, gen, countsAsFailure, true);
    }
    failTuneIn(countsAsFailure);
  }
}

export async function loadCurrent(countsAsFailure: boolean): Promise<void> {
  const track = radio.track;
  if (!track?.id) return;
  discardListen();
  const gen = ++radioGen;
  await loadResolvedRadio(track, gen, countsAsFailure, false);
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
    onListenEnded();
    /* station clock owns advance */
  });
  radioAudio.sink.setHandlers({
    onTime(t, d) {
      if (radio.chrome !== "tuned") return;
      if (radioAudio.loadInFlight || radioAudio.seekInFlight) return;
      onListenTime({
        currentTime: t,
        duration: Number.isFinite(d) && d > 0 ? d : null,
        playing: !radioAudio.paused && !radioAudio.ended,
      });
    },
  });
  radioAudio.onError(() => {
    if (radioFailures.record()) {
      showToast("Radio could not start — tuned out");
      tuneOut();
    }
  });
}
