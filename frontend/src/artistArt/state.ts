/**
 * Client overlay for preferred artist art. HTTP success writes via
 * applyPreferredServerResult only.
 */
import { reactive } from "vue";
import { artistImageUrl, type ArtistListItem } from "@/api";

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

export function coverSrc(artist: ArtistListItem): string {
  const overlay = artistArtOverlays.get(artist.id);
  if (overlay?.previewUrl) return overlay.previewUrl;
  return artistImageUrl({
    ...artist,
    has_preferred_image: overlay?.hasPreferred ?? artist.has_preferred_image,
    preferred_rev: overlay?.preferredRev ?? artist.preferred_rev,
  });
}

export function menuHasPreferred(artist: ArtistListItem): boolean {
  const overlay = artistArtOverlays.get(artist.id);
  if (!overlay) return !!artist.has_preferred_image;
  if (overlay.pending === "revert") return false;
  return overlay.pending === "upload" || overlay.hasPreferred === true;
}
