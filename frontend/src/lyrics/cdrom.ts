/**
 * Yellow Book lyrics: companion local first, then library-server LRCLIB.
 * Does not call fetchLyrics / /api/tracks/.
 */
import { fetchCdromLyrics } from "@/api";
import { canReachServer } from "@/connectivity";
import { cdromRelOf, isCdromTrack } from "@/cd/cdrom";
import {
  peekLyricsMemory,
  rememberLyricsMemory,
} from "@/lyrics/cache";
import { emptyLyrics, fromApiLyrics, type Lyrics } from "@/models/lyrics";
import { cd } from "@/stores/cd";
import { exclusiveAudio } from "@/stores/exclusiveAudio";

export async function resolveCdromLyrics(trackId: string): Promise<Lyrics> {
  if (!trackId) return emptyLyrics(null);
  const mem = peekLyricsMemory(trackId);
  if (mem && (mem.status === "ok" || mem.status === "instrumental")) return mem;

  const track = cd.tracks.find((t) => t.id === trackId);
  if (!track || !isCdromTrack(track)) return emptyLyrics(trackId);

  const local = await fetchCompanionLyrics(cdromRelOf(track));
  if (local && (local.status === "ok" || local.plainText || local.syncedLrc)) {
    rememberLyricsMemory(trackId, local);
    return local;
  }

  if (!canReachServer()) {
    return local || emptyLyrics(trackId);
  }

  const remote = await fetchCdromLyrics({
    title: track.title,
    artist: track.artist,
    album: track.album,
    duration_ms: track.durationMs,
  });
  const payload = { ...remote, trackId };
  rememberLyricsMemory(trackId, payload);
  return payload;
}

async function fetchCompanionLyrics(rel: string): Promise<Lyrics | null> {
  const deviceId = cd.selectedDriveId;
  const token = exclusiveAudio.companionToken;
  const port = exclusiveAudio.port || 18765;
  if (!deviceId || !token || !rel) return null;
  const url = new URL("/cdrom/lyrics", `http://127.0.0.1:${port}`);
  url.searchParams.set("device", deviceId);
  url.searchParams.set("rel", rel);
  url.searchParams.set("token", token);
  try {
    const res = await fetch(url.href);
    if (!res.ok) return null;
    const raw = (await res.json()) as {
      plain?: string | null;
      synced?: string | null;
      source?: string | null;
    };
    if (!raw.plain && !raw.synced) return null;
    return fromApiLyrics({
      track_id: `cdrom:${rel}`,
      status: "ok",
      source: raw.source || "local_lrc",
      is_synced: !!raw.synced,
      plain_text: raw.plain ?? null,
      synced_lrc: raw.synced ?? null,
      instrumental: false,
    });
  } catch {
    return null;
  }
}
