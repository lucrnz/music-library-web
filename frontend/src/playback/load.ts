/**
 * On-demand load + fail. Transport stays in stores/player.ts.
 */
import { canUseRemoteMedia, getConnectivityState } from "@/connectivity";
import { beginPlay, emit } from "@/diag/log";
import { markTrackBroken } from "@/downloads/catalog";
import { downloads } from "@/downloads/state";
import { createCompanionSink } from "@/playback/sinks/companionSink";
import { createHtmlAudioSink } from "@/playback/sinks/htmlAudioSink";
import type { PlaybackSink } from "@/playback/sinks/types";
import { supportsCodecKind } from "@/codecSupport";
import { SOURCE_TAG, deliveryCodec } from "@/lossyKind";
import type { Track } from "@/models/track";
import {
  PLAY_BLOCK_MESSAGES,
  toPlayBlockError,
  type PlayBlockReason,
} from "@/playBlock";
import {
  needsCompanionStop,
  resolvePlayIntent,
  type PlayIntent,
  type PlaySink,
} from "@/playback/playIntent";
import { showToast } from "@/stores/ui";
import {
  consumeMissingTechToast,
  shouldWarnMissingExclusiveTech,
} from "@/stores/exclusiveAudio";
import { activeDelivery } from "@/playback/deliveryPolicy";
import { isHardJoinBlock } from "@/playback/queueJoin";
import { pl } from "@/stores/playlist";
import {
  clearPlaySourceState,
  player,
  setPlayNotice,
  setPlaySourceState,
} from "@/stores/playerState";
import { getActiveStreamCodec, openSettings, settings } from "@/stores/settings";

export const htmlSink = createHtmlAudioSink();
export const companionSink = createCompanionSink();

let activeSink: PlaybackSink = htmlSink;

/** blob: URL we must revoke */
let localPlayUrl: string | null = null;

/** Current playIndex / stopPlayback load generation (stale-await guard). */
let playGen = 0;

export function getActiveSink(): PlaybackSink {
  return activeSink;
}

export function failCtx(
  extra?: Record<string, unknown> | null,
): Record<string, unknown> {
  return {
    track_id: pl.current?.id ?? null,
    play_source: player.playSource,
    profile: player.playProfileId,
    reason: extra?.reason ?? player.playBlockReason,
    connectivity: getConnectivityState(),
    ...(extra && typeof extra === "object" ? extra : {}),
  };
}

export function beginLoad() {
  playGen += 1;
  beginPlay();
  clearPlaySourceState();
  player.loadPending = true;
  try {
    htmlSink.stop();
  } catch {
    /* ignore */
  }
  return playGen;
}

export function still(gen: number) {
  return gen === playGen;
}

export function invalidateLoads() {
  playGen += 1;
  player.loadPending = false;
}

function applyIntent(intent: PlayIntent) {
  if (intent.source === "unavailable") {
    setPlaySourceState("unavailable", intent.profile, intent.block);
    emit(
      "player.unavailable",
      failCtx({ reason: intent.block }),
      "error",
    );
    return;
  }
  setPlaySourceState(intent.source, intent.profile, null);
  emit(
    "player.resolve",
    { type: intent.source, profile: intent.profile },
    "info",
  );
}

export function failCurrentLoad(opts: {
  reason: PlayBlockReason;
  message?: string | null;
  toast?: boolean | string;
}) {
  const reason = opts.reason || "exclusive_failed";
  const exclusive = reason.startsWith("exclusive");
  const raw =
    opts.message ||
    PLAY_BLOCK_MESSAGES[reason] ||
    PLAY_BLOCK_MESSAGES.exclusive_failed;
  const notice = exclusive ? raw : `${pl.current?.title || "Track"}: ${raw}`;
  applyIntent({
    source: "unavailable",
    profile: player.playProfileId ?? null,
    block: reason,
    message: notice,
  });
  emit(
    "player.load.fail",
    failCtx({ reason, message: notice || null }),
    "error",
  );
  if (exclusive) {
    try {
      activeSink.stop();
    } catch {
      /* ignore */
    }
  }
  setPlayNotice(notice);
  const shouldToast = exclusive ? opts.toast !== false : !!opts.toast;
  if (shouldToast) {
    showToast(typeof opts.toast === "string" ? opts.toast : exclusive ? raw : notice);
  }
  if (reason === "exclusive_needs_device") {
    openSettings();
  }
  const held = player.currentTime;
  player.loadPending = false;
  syncTransportFlags();
  if (held > 0) player.currentTime = held;
}

export function revokeLocalPlayUrl() {
  if (localPlayUrl) {
    URL.revokeObjectURL(localPlayUrl);
    localPlayUrl = null;
  }
}

function stopSink(sink: PlaybackSink) {
  try {
    sink.stop();
  } catch {
    /* ignore */
  }
}

/** Leave on-demand media: both sinks + revoke the local blob. */
export function teardownOnDemandMedia() {
  player.loadPending = false;
  stopSink(htmlSink);
  stopSink(companionSink);
  revokeLocalPlayUrl();
}

export function selectSink(kind: PlaySink) {
  const next = kind === "companion" ? companionSink : htmlSink;
  if (next === activeSink) return;
  try {
    activeSink.stop();
  } catch {
    /* ignore */
  }
  activeSink = next;
  activeSink.setVolume(player.volume);
}

export function syncTransportFlags() {
  player.paused = activeSink.paused;
  const sinkTime = activeSink.currentTime || 0;
  if (!(player.loadPending && player.currentTime > 0 && sinkTime === 0)) {
    player.currentTime = sinkTime;
  }
  player.duration = Number.isFinite(activeSink.duration)
    ? activeSink.duration
    : 0;
  if ("mediaSession" in navigator) {
    navigator.mediaSession.playbackState =
      pl.index >= 0 ? (activeSink.paused ? "paused" : "playing") : "none";
  }
}

async function attemptPlay(
  url: string,
  gen: number,
): Promise<{ ok: true } | { ok: false; err: ReturnType<typeof toPlayBlockError> }> {
  if (!still(gen)) return { ok: false, err: toPlayBlockError(undefined, "play_failed") };
  try {
    await activeSink.load(url);
    if (!still(gen)) {
      return { ok: false, err: toPlayBlockError(undefined, "play_failed") };
    }
    return { ok: true };
  } catch (err: unknown) {
    const block = toPlayBlockError(err, "play_failed");
    if (activeSink.kind === "htmlAudio") {
      emit(
        "sink.html.play_reject",
        failCtx({
          name: err instanceof Error ? err.name : null,
          message: block.message,
        }),
        "error",
      );
    }
    return { ok: false, err: block };
  }
}

async function sourceKindSupported(track: Track | null | undefined) {
  const kind = (track?.sourceCodec || "").toLowerCase();
  return (kind === "mp3" || kind === "aac") && (await supportsCodecKind(kind));
}

async function intentForTrack(
  track: Track | null | undefined,
  gen: number,
  extra: { localBroken?: boolean } = {},
): Promise<PlayIntent | null> {
  const policy = activeDelivery();
  const activeCodec =
    deliveryCodec(track, getActiveStreamCodec()) || getActiveStreamCodec();
  let sourceOk: boolean | undefined;
  if (policy.sink !== "companion" && activeCodec === SOURCE_TAG) {
    sourceOk = await sourceKindSupported(track);
    if (!still(gen)) return null;
  }
  return resolvePlayIntent(track, {
    sink: policy.sink,
    exclusiveTag: policy.sink === "companion" ? policy.profileFor(track) : null,
    enabled: downloads.enabled,
    offline: !canUseRemoteMedia(),
    activeStreamCodec: getActiveStreamCodec(),
    playbackPolicy: settings.playbackPolicy,
    catalog: settings.options,
    localBroken: extra.localBroken,
    sourceKindSupported: sourceOk,
    probeRemote: true,
  });
}

export type LoadResolvedResult =
  | { ok: true }
  | { ok: false; retryable: true }
  | { ok: false; retryable: false };

export async function loadResolved(
  gen: number,
  track: Track | null | undefined,
  extra: { localBroken?: boolean } = {},
): Promise<LoadResolvedResult> {
  const intent = await intentForTrack(track, gen, extra);
  if (!still(gen) || !intent) {
    if (still(gen)) player.loadPending = false;
    return { ok: false, retryable: false };
  }
  applyIntent(intent);
  if (needsCompanionStop(intent, activeSink.kind)) {
    stopSink(companionSink);
    revokeLocalPlayUrl();
  }
  if (intent.source === "unavailable") {
    failCurrentLoad({
      reason: intent.block,
      message: intent.message || PLAY_BLOCK_MESSAGES[intent.block],
    });
    return { ok: false, retryable: false };
  }

  if (
    intent.sink === "companion" &&
    shouldWarnMissingExclusiveTech(track) &&
    track?.id &&
    consumeMissingTechToast(track.id)
  ) {
    showToast(
      `${track.title || "Track"}: source format unknown - using device max`,
    );
  }

  selectSink(intent.sink);
  setPlayNotice(null);
  if (intent.source === "downloaded") {
    localPlayUrl = intent.url;
  }

  const result = await attemptPlay(intent.url, gen);
  if (!still(gen)) return { ok: false, retryable: false };
  if (!result.ok && intent.source === "downloaded" && !extra.localBroken) {
    console.warn("Local playback failed, falling back to stream", result.err);
    if (track?.id) markTrackBroken(track.id).catch(() => {});
    revokeLocalPlayUrl();
    return loadResolved(gen, track, { localBroken: true });
  }
  if (!result.ok) {
    const err = result.err;
    if (isHardJoinBlock(err.reason)) {
      if (err.reason.startsWith("exclusive")) {
        console.error("Exclusive playback failed", err);
      } else {
        console.error("Playback failed", err);
      }
      failCurrentLoad({
        reason: err.reason,
        message: err.message,
        toast: err.reason.startsWith("exclusive") ? true : undefined,
      });
      return { ok: false, retryable: false };
    }
    return { ok: false, retryable: true };
  }
  emit(
    "player.load.ok",
    { play_source: player.playSource, profile: player.playProfileId },
    "info",
  );
  syncTransportFlags();
  player.loadPending = false;
  return { ok: true };
}
