/**
 * Pure-ish play / media resolution for downloads.
 */

import { streamUrl } from "../api.js";
import { PLACEHOLDER_COVER } from "../util.js";
import { getLocalCoverUrl } from "./art.js";
import { getLocalAudioUrl, getTrackRecord } from "./records.js";

/**
 * @typedef {'local'|'remote'|'unavailable'} PlaySourceType
 * @typedef {'missing'|'other_codec'|'broken'|'no_id'|'offline_no_local'} PlayBlockReason
 *
 * @typedef {object} PlaySource
 * @property {PlaySourceType} type
 * @property {string|null} url
 * @property {PlayBlockReason|null} reason
 * @property {string|null} message
 */

const MESSAGES = {
  missing: "Not downloaded for offline play. Download it while online.",
  other_codec:
    "Downloaded in a different quality. Go online or re-download at the current streaming quality.",
  broken: "Local file is unreadable. Re-download when online.",
  no_id: "Track has no id.",
  offline_no_local:
    "You're offline and this track isn't downloaded for the current quality.",
};

/**
 * Resolve where to play a track from.
 * @param {{ id?: string, title?: string }|null} track
 * @param {{ enabled: boolean, codec: string, offline: boolean }} ctx
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

  if (ctx.enabled) {
    try {
      const local = await getLocalAudioUrl(track.id, ctx.codec);
      if (local) {
        return { type: "local", url: local, reason: null, message: null };
      }
    } catch (err) {
      console.warn("Local download resolve failed", err);
    }

    if (ctx.offline) {
      const rec = await getTrackRecord(track.id);
      let reason = /** @type {PlayBlockReason} */ ("missing");
      if (rec?.status === "broken") reason = "broken";
      else if (rec && rec.codec !== ctx.codec) reason = "other_codec";
      else if (!rec) reason = "offline_no_local";
      return {
        type: "unavailable",
        url: null,
        reason,
        message: MESSAGES[reason],
      };
    }
  } else if (ctx.offline) {
    return {
      type: "unavailable",
      url: null,
      reason: "offline_no_local",
      message: MESSAGES.offline_no_local,
    };
  }

  const remote = streamUrl(track, ctx.codec);
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
