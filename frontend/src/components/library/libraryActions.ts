/**
 * Library queue / download actions (not view wiring).
 */

import {
  collectTracks,
  fetchAlbumTracks,
  fetchArtistAlbums,
} from "@/api";
import { downloadTracks } from "@/downloads/ui";
import { downloads } from "@/downloads/state";
import { addToQueue } from "@/stores/playlist";
import { clearLibSelection, showToast, ui } from "@/stores/ui";
import type { Track } from "@/models/track";

export async function addAllForFolder(path: string): Promise<void> {
  await addToQueue(await collectTracks(path || ""));
}

export async function addAllForArtist(artistId: string): Promise<void> {
  if (!artistId) return;
  const albumList = await fetchArtistAlbums(artistId);
  const trackLists = await Promise.all(
    albumList.map((album) => fetchAlbumTracks(album.id)),
  );
  await addToQueue(trackLists.flat());
}

export async function addAllForAlbum(albumId: string): Promise<void> {
  if (!albumId) return;
  await addToQueue(await fetchAlbumTracks(albumId));
}

export async function downloadAlbumById(albumId: string): Promise<void> {
  if (!downloads.enabled || !albumId) return;
  try {
    const tracks = await fetchAlbumTracks(albumId);
    await downloadTracks(tracks.filter((t) => t.id && !t.isMissing));
  } catch (err: unknown) {
    console.error(err);
    showToast(err instanceof Error ? err.message : "Download failed");
  }
}

export interface AddAllLocation {
  mode: string;
  routeName: string | symbol | null | undefined;
  folderPath: string;
  artistId?: string;
  albumId?: string;
}

/** Add all playable tracks for the current library location. */
export async function addAll(loc: AddAllLocation): Promise<void> {
  try {
    if (loc.mode === "folders") {
      await addAllForFolder(loc.folderPath);
      return;
    }
    if (loc.routeName === "album" && loc.albumId) {
      await addAllForAlbum(loc.albumId);
      return;
    }
    if (loc.routeName === "artist" && loc.artistId) {
      await addAllForArtist(loc.artistId);
    }
  } catch (err: unknown) {
    console.error(err);
  }
}

/** Collect + queue tracks for currently multi-selected folder paths. */
export async function addSelected(): Promise<void> {
  if (!ui.libSelected.size) return;
  const tracksOut = (
    await Promise.all(
      [...ui.libSelected].map(async ([p]) => {
        try {
          return await collectTracks(p);
        } catch (err: unknown) {
          console.error(err);
          return [];
        }
      }),
    )
  ).flat();
  clearLibSelection();
  await addToQueue(tracksOut);
}

/** Download album tracks currently shown (body kind tracks). */
export async function downloadCurrentAlbum(tracks: Track[]): Promise<void> {
  if (!downloads.enabled || !tracks?.length) return;
  try {
    await downloadTracks(tracks.filter((t) => t.id && !t.isMissing));
  } catch (err: unknown) {
    console.error(err);
    showToast(err instanceof Error ? err.message : "Download failed");
  }
}
