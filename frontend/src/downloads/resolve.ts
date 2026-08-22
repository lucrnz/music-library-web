/**
 * Pure-ish play / media resolution for downloads.
 */

import { streamUrl } from "@/api";
import {
  PLAY_BLOCK_MESSAGES,
  playBlockMessage,
  type PlayBlockReason,
} from "@/playBlock";
import { localAtLeastAsGood } from "@/qualityRank";
import type { CatalogTrackRecord } from "@/models/track";
import type { PlaybackPolicy } from "@/stores/settings";
import { PLACEHOLDER_COVER } from "@/util";
import {
  getLocalAudioUrlForRecord,
  getLocalCoverUrl,
  getTrackRecord,
} from "@/downloads/catalog";

export type { PlaybackPolicy };

export type PlayDelivery =
  | {
      source: "unavailable";
      profile: string | null;
      block: PlayBlockReason;
      message: string | null;
    }
  | {
      source: "streaming" | "downloaded";
      url: string;
      profile: string | null;
    };

function unavailable(
  block: PlayBlockReason,
  profile: string | null = null,
  message?: string | null,
): PlayDelivery {
  return {
    source: "unavailable",
    profile,
    block,
    message: message ?? PLAY_BLOCK_MESSAGES[block],
  };
}

function ready(
  source: "streaming" | "downloaded",
  url: string,
  profile: string | null,
): PlayDelivery {
  return { source, url, profile };
}

/**
 * @param {object|null} rec
 * @returns {boolean}
 */
function recordPlayable(
  rec: CatalogTrackRecord | null,
): rec is CatalogTrackRecord & { codec: string } {
  return !!(rec && rec.status !== "broken" && rec.codec);
}

function recordCodec(rec: CatalogTrackRecord | null | undefined): string | null {
  return typeof rec?.codec === "string" ? rec.codec : null;
}

/**
 * Whether current policy prefers a local file over streaming when online.
 * @param {string} localCodec
 * @param {string} activeStreamCodec
 * @param {PlaybackPolicy} policy
 * @param {{ id: string }[]} catalog
 */
export function shouldPreferLocalOnline(
  localCodec: string,
  activeStreamCodec: string,
  policy: PlaybackPolicy,
  catalog: { id: string }[] = [],
) {
  if (policy === "prefer_offline") return true;
  if (policy === "prefer_stream") return false;
  // prefer_better
  return localAtLeastAsGood(localCodec, activeStreamCodec, catalog);
}

/** In-memory projection: will online playback prefer this local file? */
export function willPreferLocal(
  projection: { codec?: string; status?: string } | null | undefined,
  activeCodec: string,
  policy: PlaybackPolicy,
  catalog: { id: string }[] = [],
): boolean {
  if (!projection || projection.status === "broken" || !projection.codec) {
    return false;
  }
  return shouldPreferLocalOnline(
    projection.codec,
    activeCodec,
    policy,
    catalog,
  );
}

/** Open local blob only after policy decides local wins. */
async function openDownloadedSource(
  rec: CatalogTrackRecord & { codec: string },
): Promise<PlayDelivery> {
  try {
    const url = await getLocalAudioUrlForRecord(rec);
    if (url) {
      return ready("downloaded", url, rec.codec);
    }
  } catch (err: unknown) {
    console.warn("Local download open failed", err);
  }
  return unavailable("broken", recordCodec(rec));
}

/**
 * Resolve where to play a track from.
 * Decision-first: load record once, prefer download vs stream, open blob only if download wins.
 * @param {{ id?: string, title?: string }|null} track
 * @param {{
 *   enabled: boolean,
 *   offline: boolean,
 *   activeStreamCodec: string,
 *   playbackPolicy?: PlaybackPolicy,
 *   catalog?: { id: string }[],
 * }} ctx
 */
export async function resolvePlaySource(
  track: { id?: string; title?: string } | null | undefined,
  ctx: {
    enabled: boolean;
    offline: boolean;
    activeStreamCodec: string;
    playbackPolicy?: PlaybackPolicy;
    catalog?: { id: string }[];
  },
): Promise<PlayDelivery> {
  if (!track?.id) {
    return unavailable("no_id");
  }

  const policy = ctx.playbackPolicy || "prefer_better";
  const catalog = ctx.catalog || [];
  const active = ctx.activeStreamCodec;

  let rec: CatalogTrackRecord | null = null;
  if (ctx.enabled) {
    try {
      rec = (await getTrackRecord(track.id)) ?? null;
    } catch (err: unknown) {
      console.warn("Local download resolve failed", err);
    }
  }
  if (ctx.offline) {
    if (recordPlayable(rec)) return openDownloadedSource(rec);
    let reason: PlayBlockReason = "missing";
    if (rec?.status === "broken") reason = "broken";
    else if (!rec) reason = "offline_no_local";
    return unavailable(reason, recordCodec(rec) || active || null, playBlockMessage(reason));
  }

  const localCodec = recordCodec(rec);
  if (
    recordPlayable(rec) &&
    localCodec &&
    shouldPreferLocalOnline(localCodec, active, policy, catalog)
  ) {
    const downloaded = await openDownloadedSource(rec);
    if (downloaded.source === "downloaded") return downloaded;
    // Blob missing despite record — fall through to stream when online.
  }

  const remote = streamUrl(track, active);
  if (!remote) {
    return unavailable("no_id", active || null);
  }
  return ready("streaming", remote, active || null);
}

/**
 * Prefer local cover when downloads enabled and present.
 * Only returns a remote /api/cover URL after the local OPFS check misses
 * and the caller allows network (opts.offline !== true). Offline / no-remote
 * falls back to the static placeholder so <img> and Media Session never
 * point at dead cover endpoints for already-downloaded art.
 *
 * @param {string|null|undefined} albumId
 * @param {'thumb'|'full'} size
 * @param {string|null|undefined} remoteUrl
 * @param {boolean} enabled
 * @param {{ offline?: boolean }} [opts]
 */
export async function resolveCoverUrl(
  albumId: string | null | undefined,
  size: "thumb" | "full",
  remoteUrl: string | null | undefined,
  enabled: boolean,
  opts: { offline?: boolean } = {},
) {
  if (enabled && albumId) {
    try {
      const local = await getLocalCoverUrl(albumId, size);
      if (local) return local;
    } catch (err: unknown) {
      console.warn("Local cover resolve failed", err);
    }
  }
  if (opts.offline) return PLACEHOLDER_COVER;
  return remoteUrl || PLACEHOLDER_COVER;
}
