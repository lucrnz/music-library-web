/**
 * Pure-ish play / media resolution for downloads.
 */

import { streamUrl } from "../api.js";
import { localAtLeastAsGood } from "../qualityRank.js";
import { PLACEHOLDER_COVER } from "../util.js";
import { getLocalCoverUrl } from "./art.js";
import { getLocalAudioUrlForRecord, getTrackRecord } from "./records.js";

/**
 * @typedef {'local'|'remote'|'unavailable'} PlaySourceType
 * @typedef {'missing'|'broken'|'no_id'|'offline_no_local'} PlayBlockReason
 * @typedef {'prefer_better'|'prefer_offline'|'prefer_stream'} PlaybackPolicy
 *
 * @typedef {object} PlaySource
 * @property {PlaySourceType} type
 * @property {string|null} url
 * @property {PlayBlockReason|null} reason
 * @property {string|null} message
 * @property {string|null} [codec] codec used for local source
 */

const MESSAGES = {
  missing: "Not downloaded for offline play. Download it while online.",
  broken: "Local file is unreadable. Re-download when online.",
  no_id: "Track has no id.",
  offline_no_local:
    "You're offline and this track isn't downloaded.",
};

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
async function openLocalSource(rec) {
  try {
    const url = await getLocalAudioUrlForRecord(rec);
    if (url) {
      return {
        type: "local",
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
    message: MESSAGES.broken,
  };
}

/**
 * Resolve where to play a track from.
 * Decision-first: load record once, decide local vs remote, open blob only if local wins.
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
      message: MESSAGES.no_id,
    };
  }

  const policy = ctx.playbackPolicy || "prefer_better";
  const catalog = ctx.catalog || [];
  const active = ctx.activeStreamCodec;

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
    if (playable) return openLocalSource(rec);
    let reason = /** @type {PlayBlockReason} */ ("missing");
    if (rec?.status === "broken") reason = "broken";
    else if (!rec) reason = "offline_no_local";
    return {
      type: "unavailable",
      url: null,
      reason,
      message: MESSAGES[reason],
    };
  }

  if (
    playable &&
    shouldPreferLocalOnline(rec.codec, active, policy, catalog)
  ) {
    const local = await openLocalSource(rec);
    if (local.type === "local") return local;
    // Blob missing despite record — fall through to stream when online.
  }

  const remote = streamUrl(track, active);
  if (!remote) {
    return {
      type: "unavailable",
      url: null,
      reason: "no_id",
      message: MESSAGES.no_id,
    };
  }
  return { type: "remote", url: remote, reason: null, message: null };
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
