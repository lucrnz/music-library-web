/**
 * Cover resolve + Media Session metadata. Imports playerState, not player.js.
 */
import { coverUrl } from "@/api";
import { canUseRemoteMedia, onConnectivityChange } from "@/connectivity";
import { resolveCoverUrl } from "@/downloads/resolve";
import { downloads } from "@/downloads/state";
import { PLACEHOLDER_COVER } from "@/util";
import { activeSession } from "@/playback/session";
import { pl } from "@/stores/playlist";
import { player } from "@/stores/playerState";

const msSupported = typeof navigator !== "undefined" && "mediaSession" in navigator;

let coverResolveGen = 0;
let lastCoverTrackId: string | null = null;
let sessionBound = false;

export function clearCovers() {
  player.coverThumb = PLACEHOLDER_COVER;
  player.coverFull = PLACEHOLDER_COVER;
}

export function invalidateCoverCache() {
  lastCoverTrackId = null;
}

/**
 * Retry cover resolve when remote media becomes usable (boot race: downloads
 * catalog can finish before the first reportSuccess).
 */
export function initPlayerSession() {
  if (sessionBound) return;
  sessionBound = true;
  onConnectivityChange(() => {
    if (!canUseRemoteMedia()) return;
    void updateMediaSession();
  });
}

/**
 * Resolve local/remote covers into player state + Media Session.
 */
export async function updateMediaSession() {
  if (activeSession() === "cd") return;
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

  const nextThumb = thumb || PLACEHOLDER_COVER;
  const nextFull = full || PLACEHOLDER_COVER;
  player.coverThumb = nextThumb;
  player.coverFull = nextFull;
  // Unconfirmed reachability yields placeholders — do not latch, so the
  // connectivity confirm can resolve remote covers without a play tap.
  if (
    allowRemote ||
    nextThumb !== PLACEHOLDER_COVER ||
    nextFull !== PLACEHOLDER_COVER
  ) {
    lastCoverTrackId = trackKey;
  }

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
