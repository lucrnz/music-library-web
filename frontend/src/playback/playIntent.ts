/**
 * Single play decision: sink + source + profile + url + block.
 * Exclusive is companion+streaming. HTML uses resolvePlaySource.
 */
import { streamUrl } from "@/api";
import { SOURCE_TAG, deliveryCodec } from "@/lossyKind";
import type { Track } from "@/models/track";
import {
  PLAY_BLOCK_MESSAGES,
  type PlayBlockReason,
} from "@/playBlock";
import {
  resolvePlaySource,
  type PlaybackPolicy,
} from "@/downloads/resolve";

export type PlaySink = "htmlAudio" | "companion";

export type PlayIntent =
  | {
      source: "unavailable";
      profile: string | null;
      block: PlayBlockReason;
      message: string | null;
    }
  | {
      source: "streaming" | "downloaded";
      sink: PlaySink;
      profile: string | null;
      url: string;
    };

export interface ExclusiveGate {
  ok: boolean;
  reason?: PlayBlockReason | string | null;
}

export interface PlayIntentCtx {
  exclusiveEnabled: boolean;
  exclusiveTag: string | null;
  exclusiveGate?: ExclusiveGate;
  enabled: boolean;
  offline: boolean;
  activeStreamCodec: string;
  playbackPolicy?: PlaybackPolicy;
  catalog?: { id: string }[];
  localBroken?: boolean;
  sourceKindSupported?: boolean;
  absoluteStream?: boolean;
}

function blocked(
  reason: PlayBlockReason,
  profile: string | null = null,
  message?: string | null,
): PlayIntent {
  return {
    source: "unavailable",
    profile,
    block: reason,
    message: message ?? PLAY_BLOCK_MESSAGES[reason],
  };
}

export function hrefForStream(
  track: { id?: string } | null | undefined,
  tag: string,
  absolute: boolean,
): string | null {
  const path = streamUrl(track, tag);
  if (!path) return null;
  if (!absolute) return path;
  try {
    return new URL(path, location.origin).href;
  } catch {
    return path;
  }
}

function exclusiveIntent(
  track: Track | null | undefined,
  ctx: PlayIntentCtx,
): PlayIntent {
  if (track?.isLossy) {
    return blocked("exclusive_lossy");
  }
  const gate = ctx.exclusiveGate;
  if (gate && !gate.ok) {
    const raw = gate.reason || "exclusive_not_ready";
    const known =
      raw in PLAY_BLOCK_MESSAGES
        ? (raw as PlayBlockReason)
        : "exclusive_not_ready";
    return blocked(known);
  }
  const tag = ctx.exclusiveTag;
  if (!tag) {
    return blocked("exclusive_no_format");
  }
  const url = hrefForStream(track, tag, ctx.absoluteStream !== false);
  if (!url) {
    return blocked("play_failed", tag);
  }
  return {
    sink: "companion",
    source: "streaming",
    profile: tag,
    url,
  };
}

export async function resolvePlayIntent(
  track: Track | null | undefined,
  ctx: PlayIntentCtx,
): Promise<PlayIntent> {
  if (ctx.exclusiveEnabled) {
    return exclusiveIntent(track, ctx);
  }

  const activeCodec =
    deliveryCodec(track, ctx.activeStreamCodec) || ctx.activeStreamCodec;

  if (activeCodec === SOURCE_TAG && ctx.sourceKindSupported === false) {
    return blocked("codec_unsupported", SOURCE_TAG);
  }

  if (ctx.localBroken) {
    if (ctx.offline) {
      return blocked("broken", activeCodec || null);
    }
    const url = hrefForStream(track, activeCodec, false);
    if (!url) {
      return blocked("play_failed", activeCodec || null);
    }
    return {
      sink: "htmlAudio",
      source: "streaming",
      profile: activeCodec || null,
      url,
    };
  }

  const source = await resolvePlaySource(track, {
    enabled: ctx.enabled,
    offline: ctx.offline,
    activeStreamCodec: activeCodec,
    playbackPolicy: ctx.playbackPolicy,
    catalog: ctx.catalog,
  });

  if (source.type === "unavailable") {
    return blocked(
      source.reason,
      source.codec || activeCodec || null,
      source.message,
    );
  }

  return {
    sink: "htmlAudio",
    source: source.type,
    profile: source.codec || activeCodec || null,
    url: source.url,
  };
}

/** Exclusive same-sink loads must not release the hog. */
export function needsCompanionStop(
  intent: PlayIntent,
  activeKind: PlaySink,
): boolean {
  if (intent.source === "unavailable") return true;
  return intent.sink !== activeKind;
}
