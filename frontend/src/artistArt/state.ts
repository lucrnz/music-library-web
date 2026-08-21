/**
 * Client overlay for preferred artist art. HTTP success writes via
 * applyPreferredServerResult only.
 */
import { reactive } from "vue";
import { artistImageUrl } from "@/api";
import type { Artist } from "@/models/artist";

export type OverlayPending = "upload" | "revert";

export interface ArtistArtOverlay {
  previewUrl?: string;
  hasPreferred: boolean;
  preferredRev: number;
  pending?: OverlayPending;
}

export const artistArtOverlays = reactive(
  new Map<string, ArtistArtOverlay>(),
);

export function revokePreviewUrl(id: string) {
  const row = artistArtOverlays.get(id);
  if (row?.previewUrl) {
    URL.revokeObjectURL(row.previewUrl);
  }
}

export function coverSrc(artist: Artist): string {
  const overlay = artistArtOverlays.get(artist.id);
  if (overlay?.previewUrl) return overlay.previewUrl;
  return artistImageUrl({
    ...artist,
    hasPreferredImage: overlay?.hasPreferred ?? artist.hasPreferredImage,
    preferredRev: overlay?.preferredRev ?? artist.preferredRev,
  });
}

export function menuHasPreferred(artist: Artist): boolean {
  const overlay = artistArtOverlays.get(artist.id);
  if (!overlay) return !!artist.hasPreferredImage;
  if (overlay.pending === "revert") return false;
  return overlay.pending === "upload" || overlay.hasPreferred === true;
}
