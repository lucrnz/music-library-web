/**
 * Radio face machine, load, and Media Session.
 * Socket I/O stays in runtime.ts. Chrome stays in stores/radio.ts.
 */
import { streamUrl } from "@/api";
import { markTrackBroken } from "@/downloads/catalog";
import { resolvePlaySource } from "@/downloads/resolve";
import { downloads } from "@/downloads/state";
import { SOURCE_TAG } from "@/lossyKind";
import {
  PLAY_BLOCK_MESSAGES,
  PlayBlockError,
  type PlayBlockReason,
} from "@/playBlock";
import { exclusiveDelivery } from "@/playback/exclusiveDelivery";
import { requestPrepare } from "@/playback/prepare";
import { suspendMediaSession } from "@/playback/session";
import { createJoinHold } from "@/playback/joinHold";
import { needsReseek } from "@/radio/sync";
import {
  getExclusiveProfileTag,
  isExclusiveEnabled,
} from "@/stores/exclusiveAudio";
import {
  cancelRadioRejoin,
  interpolatedPosition,
  radio,
  radioAudio,
  scheduleRadioRejoin,
  tuneIn,
  tuneOut,
} from "@/stores/radio";
import { getActiveStreamCodec, openSettings, settings } from "@/stores/settings";
import { showToast } from "@/stores/ui";

let lastLoadedTrackId: string | null = null;
let lastLoadedLossy: boolean | null = null;
let radioGen = 0;
let audioBound = false;
let localRadioUrl: string | null = null;
const joinHold = createJoinHold();

export function cancelRadioJoinHold(): void {
  joinHold.cancel();
}

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
  cancelRadioJoinHold();
  lastLoadedTrackId = null;
  lastLoadedLossy = null;
  revokeRadioLocalUrl();
  radio.playSource = "none";
}

export function maybeReseek(): void {
  if (radio.chrome !== "tuned") return;
  const official = interpolatedPosition();
  const dur = radioAudio.duration;
  if (Number.isFinite(dur) && dur > 0 && official >= dur) {
    return;
  }
  if (needsReseek(radioAudio.currentTime, official)) {
    void radioAudio.seek(official);
  }
}

export async function onFaceOrTrack(prevId: string | null): Promise<void> {
  bindAudioHandlers();
  if (!isChromeActive(radio.chrome)) return;
  if (radio.face === "idle" && (radio.chrome === "tuning" || radio.chrome === "tuned")) {
    tuneOut();
    return;
  }
  if (radio.face === "catching_up" || radio.face === "skip_pending") {
    if (radio.chrome === "tuned") radio.chrome = "tuning";
    cancelRadioRejoin();
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
    radio.chrome = "tuning";
    await loadCurrent();
  } else if (radio.chrome === "tuned") {
    maybeReseek();
  }
}

function streamCodecForLoad(): string {
  return radio.isLossy ? SOURCE_TAG : radio.tunerProfile || getActiveStreamCodec();
}

type RadioDelivery =
  | { source: "unavailable"; block?: PlayBlockReason | null }
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

async function resolveExclusiveRadio(
  track: Parameters<typeof exclusiveDelivery>[0],
  localBroken: boolean,
): Promise<RadioDelivery> {
  const d = await exclusiveDelivery(track, {
    enabled: localBroken ? false : downloads.enabled,
    offline: false,
    exclusiveTag: getExclusiveProfileTag(track),
    activeStreamCodec: streamCodecForLoad(),
    playbackPolicy: settings.playbackPolicy,
    catalog: settings.options,
  });
  if (d.source === "unavailable") {
    return { source: "unavailable", block: d.block };
  }
  return d;
}

function failExclusiveTune(reason: string | null | undefined): void {
  if (reason === "exclusive_needs_device") {
    showToast(PLAY_BLOCK_MESSAGES.exclusive_needs_device);
    openSettings();
  } else if (reason === "exclusive_readonly" || reason === "exclusive_no_format") {
    showToast(PLAY_BLOCK_MESSAGES[reason]);
  }
  failTuneIn();
}

function rememberDelivery(
  source: "streaming" | "downloaded",
  profile: string | null,
): void {
  radio.playSource = source;
  radio.playProfileId = radio.isLossy ? null : profile;
}

function failTuneIn(): void {
  scheduleRadioRejoin();
}

async function loadResolvedRadio(
  track: { id: string; title?: string },
  gen: number,
  localBroken: boolean,
): Promise<void> {
  const exclusive = isExclusiveEnabled();
  radioAudio.setBackend(exclusive ? "companion" : "htmlAudio");
  const resolved = exclusive
    ? await resolveExclusiveRadio(radio.track, localBroken)
    : await resolveRadioDelivery(track, localBroken);
  if (gen !== radioGen) return;
  if (resolved.source === "unavailable") {
    if (exclusive) failExclusiveTune(resolved.block);
    else failTuneIn();
    return;
  }
  if (
    exclusive &&
    resolved.source === "streaming" &&
    resolved.profile &&
    resolved.profile !== SOURCE_TAG
  ) {
    requestPrepare([track], resolved.profile, { urgent: true });
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
    cancelRadioRejoin();
    joinHold.start();
    writeRadioMediaSession();
  } catch (err) {
    if (gen !== radioGen) return;
    if (resolved.source === "downloaded" && !localBroken) {
      console.warn("Local radio playback failed, falling back to stream");
      markTrackBroken(track.id).catch(() => {});
      revokeRadioLocalUrl();
      return loadResolvedRadio(track, gen, true);
    }
    if (exclusive && err instanceof PlayBlockError) {
      failExclusiveTune(err.reason);
      return;
    }
    failTuneIn();
  }
}

export async function loadCurrent(): Promise<void> {
  const track = radio.track;
  if (!track?.id) return;
  cancelRadioJoinHold();
  if (radio.chrome === "tuned") radio.chrome = "tuning";
  const gen = ++radioGen;
  await loadResolvedRadio(track, gen, false);
}

export function pauseWhileTuned(): void {
  if (radio.chrome !== "tuned" || radioAudio.ended) return;
  if (radioAudio.loadInFlight || radioAudio.seekInFlight) return;
  if (joinHold.pending) {
    cancelRadioJoinHold();
    radio.chrome = "tuning";
    scheduleRadioRejoin();
    return;
  }
  tuneOut();
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
    pauseWhileTuned();
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
    pauseWhileTuned();
  });
  radioAudio.onEnded(() => {
    cancelRadioJoinHold();
    /* station clock owns advance */
  });
  radioAudio.onError(() => {
    if (radio.chrome !== "tuning" && radio.chrome !== "tuned") return;
    cancelRadioJoinHold();
    radio.chrome = "tuning";
    scheduleRadioRejoin();
  });
}
