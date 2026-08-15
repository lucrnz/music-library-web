/**
 * Pure-ish play / media resolution for downloads.
 */

import { streamUrl } from "../api.js";
import { SOURCE_TAG } from "../lossyKind.js";
import {
  PLAY_BLOCK_MESSAGES,
  playBlockMessage,
} from "../playBlock.js";
import { localAtLeastAsGood } from "../qualityRank.js";
import { PLACEHOLDER_COVER } from "../util.js";
import {
  getLocalAudioUrlForRecord,
  getLocalCoverUrl,
  getTrackRecord,
} from "./catalog.js";

/**
 * @typedef {import('../playBlock.js').PlayBlockReason} PlayBlockReason
 * @typedef {import('../playBlock.js').PlaySourceState} PlaySourceState
 * @typedef {'prefer_better'|'prefer_offline'|'prefer_stream'} PlaybackPolicy
 *
 * @typedef {object} PlaySource
 * @property {'downloaded'|'streaming'|'unavailable'} type
 * @property {string|null} url
 * @property {PlayBlockReason|null} reason
 * @property {string|null} message
 * @property {string|null} [codec] delivery profile tag (download or stream)
 */

/**
 * @param {object|null} rec
 * @returns {boolean}
 */
function recordPlayable(rec) {
  return !!(rec && rec.status !== "broken" && rec.codec);
}

/**
 * Whether current policy prefers a local file over streaming when online.
 * @param {string} localCodec
 * @param {string} activeStreamCodec
 * @param {PlaybackPolicy} policy
 * @param {{ id: string }[]} catalog
 */
export function shouldPreferLocalOnline(
  localCodec,
  activeStreamCodec,
  policy,
  catalog = []
) {
  if (policy === "prefer_offline") return true;
  if (policy === "prefer_stream") return false;
  // prefer_better
  return localAtLeastAsGood(localCodec, activeStreamCodec, catalog);
}

/**
 * Open local blob only after policy decides local wins.
 * @param {object} rec
 * @returns {Promise<PlaySource>}
 */
async function openDownloadedSource(rec) {
  try {
    const url = await getLocalAudioUrlForRecord(rec);
    if (url) {
      return {
        type: "downloaded",
        url,
        reason: null,
        message: null,
        codec: rec.codec,
      };
    }
  } catch (err) {
    console.warn("Local download open failed", err);
  }
  return {
    type: "unavailable",
    url: null,
    reason: "broken",
    message: PLAY_BLOCK_MESSAGES.broken,
    codec: rec?.codec || null,
  };
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
 * @returns {Promise<PlaySource>}
 */
export async function resolvePlaySource(track, ctx) {
  if (!track?.id) {
    return {
      type: "unavailable",
      url: null,
      reason: "no_id",
      message: PLAY_BLOCK_MESSAGES.no_id,
    };
  }

  const policy = ctx.playbackPolicy || "prefer_better";
  const catalog = ctx.catalog || [];
  const active = track.isLossy ? SOURCE_TAG : ctx.activeStreamCodec;

  /** @type {object|null} */
  let rec = null;
  if (ctx.enabled) {
    try {
      rec = await getTrackRecord(track.id);
    } catch (err) {
      console.warn("Local download resolve failed", err);
    }
  }
  const playable = recordPlayable(rec);

  if (ctx.offline) {
    if (playable) return openDownloadedSource(rec);
    let reason = /** @type {PlayBlockReason} */ ("missing");
    if (rec?.status === "broken") reason = "broken";
    else if (!rec) reason = "offline_no_local";
    return {
      type: "unavailable",
      url: null,
      reason,
      message: playBlockMessage(reason),
      // Intended profile: download record when present, else active stream tag.
      codec: (rec && rec.codec) || active || null,
    };
  }

  if (
    playable &&
    shouldPreferLocalOnline(rec.codec, active, policy, catalog)
  ) {
    const downloaded = await openDownloadedSource(rec);
    if (downloaded.type === "downloaded") return downloaded;
    // Blob missing despite record — fall through to stream when online.
  }

  const remote = streamUrl(track, active);
  if (!remote) {
    return {
      type: "unavailable",
      url: null,
      reason: "no_id",
      message: PLAY_BLOCK_MESSAGES.no_id,
      codec: active || null,
    };
  }
  return {
    type: "streaming",
    url: remote,
    reason: null,
    message: null,
    codec: active || null,
  };
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
  albumId,
  size,
  remoteUrl,
  enabled,
  opts = {}
) {
  if (enabled && albumId) {
    try {
      const local = await getLocalCoverUrl(albumId, size);
      if (local) return local;
    } catch (err) {
      console.warn("Local cover resolve failed", err);
    }
  }
  if (opts.offline) return PLACEHOLDER_COVER;
  return remoteUrl || PLACEHOLDER_COVER;
}
