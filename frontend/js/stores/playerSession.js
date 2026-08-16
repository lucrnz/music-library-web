/**
 * Cover resolve + Media Session metadata. Imports playerState, not player.js.
 */
import { coverUrl } from "../api.js";
import { canUseRemoteMedia } from "../connectivity.js";
import { resolveCoverUrl } from "../downloads/resolve.js";
import { downloads } from "../downloads/state.js";
import { PLACEHOLDER_COVER } from "../util.js";
import { pl } from "./playlist.js";
import { player } from "./playerState.js";

const msSupported = typeof navigator !== "undefined" && "mediaSession" in navigator;

let coverResolveGen = 0;
/** @type {string | null} */
let lastCoverTrackId = null;

export function clearCovers() {
  player.coverThumb = PLACEHOLDER_COVER;
  player.coverFull = PLACEHOLDER_COVER;
}

export function invalidateCoverCache() {
  lastCoverTrackId = null;
}

/**
 * Resolve local/remote covers into player state + Media Session.
 */
export async function updateMediaSession() {
  const t = pl.current;
  if (!t) {
    coverResolveGen += 1;
    lastCoverTrackId = null;
    clearCovers();
    if (msSupported) navigator.mediaSession.metadata = null;
    return;
  }

  const trackKey = t.id || t.path || null;
  if (trackKey != null && trackKey === lastCoverTrackId) {
    return;
  }

  const gen = ++coverResolveGen;
  clearCovers();

  const albumId = t.albumId || null;
  if (gen !== coverResolveGen) return;

  const allowRemote = canUseRemoteMedia();
  const opts = { offline: !allowRemote };
  const remoteThumb = allowRemote ? coverUrl(t, "thumb", false) : null;
  const remoteFull = allowRemote ? coverUrl(t, "full", false) : null;

  const [thumb, full] = await Promise.all([
    resolveCoverUrl(albumId, "thumb", remoteThumb, downloads.enabled, opts),
    resolveCoverUrl(albumId, "full", remoteFull, downloads.enabled, opts),
  ]);

  if (gen !== coverResolveGen) return;
  if (pl.current?.id !== t.id) return;

  lastCoverTrackId = trackKey;
  player.coverThumb = thumb || PLACEHOLDER_COVER;
  player.coverFull = full || PLACEHOLDER_COVER;

  if (!msSupported) return;
  navigator.mediaSession.metadata = new MediaMetadata({
    title: t.title,
    artist: t.artist,
    album: t.album,
    artwork: [
      { src: player.coverThumb, sizes: "200x200", type: "image/webp" },
      { src: player.coverFull, sizes: "1000x1000", type: "image/webp" },
    ],
  });
}

/** Resolve covers for the current playlist track (e.g. after session restore). */
export function refreshPlayerCovers() {
  return updateMediaSession();
}
