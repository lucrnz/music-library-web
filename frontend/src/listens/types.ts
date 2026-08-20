import type { ArtistListItem } from "@/api";
import type { Track } from "@/models/track";

export type ListenArtist = ArtistListItem & {
  play_count: number;
  last_counted_at: string;
};

export type ListenTrack = Track & {
  playCount: number;
  lastCountedAt: string;
};

export interface ListenRankings {
  range: string;
  timezone: string;
  months: string[];
  artists: ListenArtist[];
  tracks: ListenTrack[];
}
