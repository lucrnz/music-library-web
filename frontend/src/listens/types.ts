import type { Artist } from "@/models/artist";
import type { Track } from "@/models/track";

export type ListenArtist = Artist & {
  playCount: number;
  lastCountedAt: string;
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
