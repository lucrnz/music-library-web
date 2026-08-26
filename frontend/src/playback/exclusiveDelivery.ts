/**
 * Exclusive URL / profile / block. No sink — queue attaches companion;
 * radio loads the url on its own backend.
 */
import { streamUrl } from "@/api";
import { isCompanionFileUrl } from "@/downloads/companionBlob";
import {
  resolvePlaySource,
  type PlaybackPolicy,
} from "@/downloads/resolve";
import { SOURCE_TAG } from "@/lossyKind";
import type { Track } from "@/models/track";
import {
  PLAY_BLOCK_MESSAGES,
  type PlayBlockReason,
} from "@/playBlock";

export interface ExclusiveDeliveryCtx {
  exclusiveTag: string | null;
  enabled: boolean;
  offline: boolean;
  activeStreamCodec: string;
  playbackPolicy?: PlaybackPolicy;
  catalog?: { id: string }[];
}

export type ExclusiveDelivery =
  | {
      source: "unavailable";
      profile: string | null;
      block: PlayBlockReason;
      message: string | null;
    }
  | {
      source: "streaming" | "downloaded";
      profile: string | null;
      url: string;
    };

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

export async function exclusiveDelivery(
  track: Track | null | undefined,
  ctx: ExclusiveDeliveryCtx,
): Promise<ExclusiveDelivery> {
  if (ctx.enabled && track?.id) {
    const local = await resolvePlaySource(track, {
      enabled: true,
      offline: ctx.offline,
      activeStreamCodec: track.isLossy
        ? SOURCE_TAG
        : ctx.exclusiveTag || ctx.activeStreamCodec,
      playbackPolicy: ctx.playbackPolicy,
      catalog: ctx.catalog,
    });
    if (local.source === "downloaded" && isCompanionFileUrl(local.url)) {
      return {
        source: "downloaded",
        profile: local.profile,
        url: local.url,
      };
    }
  }
  if (track?.isLossy) {
    const url = hrefForStream(track, SOURCE_TAG, true);
    if (!url) {
      return {
        source: "unavailable",
        profile: null,
        block: "exclusive_lossy",
        message: PLAY_BLOCK_MESSAGES.exclusive_lossy,
      };
    }
    return {
      source: "streaming",
      profile: SOURCE_TAG,
      url,
    };
  }
  const tag = ctx.exclusiveTag;
  if (!tag) {
    return {
      source: "unavailable",
      profile: null,
      block: "exclusive_no_format",
      message: PLAY_BLOCK_MESSAGES.exclusive_no_format,
    };
  }
  const url = hrefForStream(track, tag, true);
  if (!url) {
    return {
      source: "unavailable",
      profile: tag,
      block: "play_failed",
      message: PLAY_BLOCK_MESSAGES.play_failed,
    };
  }
  return {
    source: "streaming",
    profile: tag,
    url,
  };
}
