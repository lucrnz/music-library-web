export interface CdTocPayload {
  first_track: number;
  last_audio_track: number;
  leadout_lba: number;
  offsets: number[];
}

export interface CdTextPayload {
  album: string | null;
  artist: string | null;
  tracks: string[];
}

export interface CdMatchTrack {
  track_no: number;
  title: string;
  artist: string;
  duration_ms: number | null;
}

export interface CdMatch {
  release_mbid: string;
  title: string;
  artist: string;
  year: number | null;
  country: string | null;
  label: string | null;
  track_count: number;
  tracks: CdMatchTrack[];
}

export interface CdAppliedTrack {
  id: string;
  track_no: number;
  title: string;
  artist: string;
  duration_ms: number | null;
}

export interface CdApplied {
  discid: string;
  release_mbid: string;
  album_id: string;
  album: string;
  artist: string;
  year: number | null;
  has_cover: boolean;
  tracks: CdAppliedTrack[];
}

export interface CdIdentifyResponse {
  discid: string;
  matches: CdMatch[];
  applied?: CdApplied | null;
  cd_text: CdTextPayload | null;
}

export type IdentifyDecision =
  | { kind: "apply_memory"; dto: CdApplied }
  | { kind: "confirm_unique"; match: CdMatch }
  | { kind: "open_picker"; matches: CdMatch[] }
  | { kind: "cdtext" }
  | { kind: "unknown" };
