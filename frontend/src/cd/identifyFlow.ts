/**
 * Identify orchestration. Store stays prefs + live + cursor + face.
 */
import { confirmCd, identifyCd } from "@/api";
import { decideIdentify, unknownTrackId } from "@/cd/identify";
import type { CdApplied, CdTextPayload, CdTocPayload } from "@/cd/types";
import { activeSession } from "@/playback/session";
import {
  cd,
  setCdTracks,
  type CdToc,
  type CdTextInfo,
} from "@/stores/cd";
import type { Track } from "@/models/track";

function tocPayload(toc: CdToc | null): CdTocPayload | null {
  if (!toc) return null;
  return {
    first_track: toc.first_track,
    last_audio_track: toc.last_audio_track,
    leadout_lba: toc.leadout_lba,
    offsets: [...toc.offsets],
  };
}

function cdTextPayload(text: CdTextInfo | null): CdTextPayload | null {
  if (!text) return null;
  return {
    album: text.album,
    artist: text.artist,
    tracks: [...text.tracks],
  };
}

function durationSec(toc: CdTocPayload, trackNo: number): number | null {
  const index = trackNo - toc.first_track;
  if (index < 0 || index >= toc.offsets.length) return null;
  const start = toc.offsets[index];
  const end =
    trackNo === toc.last_audio_track ? toc.leadout_lba : toc.offsets[index + 1];
  const sectors = end - start;
  if (sectors <= 0) return null;
  return sectors / 75;
}

export function sentinelTracksFromMedia(): Track[] {
  const toc = tocPayload(cd.toc);
  if (!toc) return [];
  const text = cdTextPayload(cd.cdText);
  const rows: Track[] = [];
  for (let n = toc.first_track; n <= toc.last_audio_track; n += 1) {
    const dur = durationSec(toc, n);
    const title = text?.tracks[n - toc.first_track] || `Track ${n}`;
    rows.push({
      id: unknownTrackId(n),
      path: null,
      title,
      artist: text?.artist || "Unknown Artist",
      album: text?.album || "Audio CD",
      albumId: null,
      artistId: null,
      albumArtist: text?.artist || "Unknown Artist",
      albumArtistId: null,
      track: n,
      disc: 1,
      year: null,
      duration: dur,
      durationMs: dur != null ? Math.round(dur * 1000) : null,
      isMissing: false,
      sampleRateHz: 44100,
      bitDepth: 16,
      isLossy: false,
      sourceCodec: "cdda",
      bitrateKbps: null,
      bitrateMode: null,
    });
  }
  return rows;
}

export function applyCdDto(dto: CdApplied): void {
  const toc = tocPayload(cd.toc);
  setCdTracks(
    dto.tracks.map((t) => {
      const durSec =
        t.duration_ms != null
          ? t.duration_ms / 1000
          : toc
            ? durationSec(toc, t.track_no)
            : null;
      return {
        id: t.id,
        path: null,
        title: t.title,
        artist: t.artist,
        album: dto.album || "Audio CD",
        albumId: dto.has_cover ? dto.album_id : null,
        artistId: null,
        albumArtist: dto.artist || t.artist,
        albumArtistId: null,
        track: t.track_no,
        disc: 1,
        year: dto.year,
        duration: durSec,
        durationMs: t.duration_ms,
        isMissing: false,
        sampleRateHz: 44100,
        bitDepth: 16,
        isLossy: false,
        sourceCodec: "cdda",
        bitrateKbps: null,
        bitrateMode: null,
      };
    }),
  );
  cd.lastDiscid = dto.discid;
  cd.pickerOpen = false;
  cd.face = "idle";
}

let identifyGen = 0;

export async function runIdentify(): Promise<void> {
  const toc = tocPayload(cd.toc);
  if (!toc || activeSession() !== "cd") return;
  const gen = ++identifyGen;
  setCdTracks(sentinelTracksFromMedia());
  cd.face = "detecting";
  cd.pickerOpen = false;
  const text = cdTextPayload(cd.cdText);
  try {
    const identified = await identifyCd(toc, text);
    if (gen !== identifyGen || activeSession() !== "cd") return;
    cd.lastDiscid = identified.discid;
    const decision = decideIdentify({
      memory: null,
      identify: identified,
      cdText: text,
    });
    if (decision.kind === "apply_memory") {
      applyCdDto(decision.dto);
      return;
    }
    if (decision.kind === "confirm_unique") {
      const dto = await confirmCd(
        identified.discid,
        decision.match.release_mbid,
        toc,
      );
      if (gen !== identifyGen || activeSession() !== "cd") return;
      applyCdDto(dto);
      return;
    }
    if (decision.kind === "open_picker") {
      cd.matches = decision.matches;
      cd.pickerOpen = true;
      cd.face = "pick";
      return;
    }
    cd.face = "idle";
  } catch {
    if (gen !== identifyGen) return;
    cd.face = "idle";
  }
}

export async function confirmPickerMatch(releaseMbid: string): Promise<void> {
  const toc = tocPayload(cd.toc);
  if (!toc || !cd.lastDiscid) return;
  const dto = await confirmCd(cd.lastDiscid, releaseMbid, toc);
  applyCdDto(dto);
}
