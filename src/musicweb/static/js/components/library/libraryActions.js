/**
 * Library queue / download actions (not view wiring).
 */

import {
  collectTracks,
  fetchAlbumTracks,
  fetchArtistAlbums,
} from "../../api.js";
import { addToQueue } from "../../stores/playlist.js";
import { clearLibSelection, showToast, ui } from "../../stores/ui.js";
import { downloads } from "../../downloads/state.js";
import { downloadTracks } from "../../downloads/ui.js";

/**
 * Add all playable tracks for the current library location.
 * @param {{
 *   mode: string,
 *   routeName: string|symbol|null|undefined,
 *   folderPath: string,
 *   artistId?: string,
 *   albumId?: string,
 * }} loc
 */
export async function addAll(loc) {
  try {
    if (loc.mode === "folders") {
      await addToQueue(await collectTracks(loc.folderPath));
      return;
    }
    if (loc.routeName === "album" && loc.albumId) {
      await addToQueue(await fetchAlbumTracks(loc.albumId));
      return;
    }
    if (loc.routeName === "artist" && loc.artistId) {
      const albumList = await fetchArtistAlbums(loc.artistId);
      const trackLists = await Promise.all(
        albumList.map((album) => fetchAlbumTracks(album.id))
      );
      await addToQueue(trackLists.flat());
    }
  } catch (err) {
    console.error(err);
  }
}

/**
 * Collect + queue tracks for currently multi-selected folder paths.
 */
export async function addSelected() {
  if (!ui.libSelected.size) return;
  const tracksOut = (
    await Promise.all(
      [...ui.libSelected].map(async ([p]) => {
        try {
          return await collectTracks(p);
        } catch (err) {
          console.error(err);
          return [];
        }
      })
    )
  ).flat();
  clearLibSelection();
  await addToQueue(tracksOut);
}

/**
 * Download album tracks currently shown (body kind tracks).
 * @param {import("../../models/track.js").Track[]} tracks
 */
export async function downloadCurrentAlbum(tracks) {
  if (!downloads.enabled || !tracks?.length) return;
  try {
    await downloadTracks(tracks.filter((t) => t.id && !t.isMissing));
  } catch (err) {
    console.error(err);
    showToast(err.message || "Download failed");
  }
}
