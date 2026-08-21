/**
 * Preferred-art HTTP + the single HTTP-200 overlay/OPFS writer.
 * No submitPreferred* here.
 */
import { apiFetch } from "@/api";
import { fromApiArtist, type Artist } from "@/models/artist";
import {
  artistArtOverlays,
  revokePreviewUrl,
} from "@/artistArt/state";
import { refreshArtistArtFile } from "@/downloads/catalog";

export class PreferredRequestError extends Error {
  status?: number;
  constructor(message: string, status?: number) {
    super(message);
    this.name = "PreferredRequestError";
    this.status = status;
  }
}

async function readArtistResponse(
  res: Response,
): Promise<{ artist: Artist; status: number }> {
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new PreferredRequestError(text || res.statusText, res.status);
  }
  const artist = fromApiArtist(await res.json());
  return { artist, status: res.status };
}

export async function postPreferredArtistImage(
  artistId: string,
  blob: Blob,
): Promise<{ artist: Artist; status: number }> {
  const body = new FormData();
  body.append("file", blob, "crop.webp");
  const res = await apiFetch(
    `/api/artist-image?artist_id=${encodeURIComponent(artistId)}`,
    { method: "POST", body },
  );
  return readArtistResponse(res);
}

export async function deletePreferredArtistImage(
  artistId: string,
): Promise<{ artist: Artist; status: number }> {
  const res = await apiFetch(
    `/api/artist-image?artist_id=${encodeURIComponent(artistId)}`,
    { method: "DELETE" },
  );
  return readArtistResponse(res);
}

export function applyPreferredServerResult(
  id: string,
  artistDict: Artist,
) {
  revokePreviewUrl(id);
  artistArtOverlays.set(id, {
    hasPreferred: !!artistDict.hasPreferredImage,
    preferredRev: Number(artistDict.preferredRev) || 0,
  });
  void refreshArtistArtFile(id, artistDict);
}
