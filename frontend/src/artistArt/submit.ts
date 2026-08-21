/**
 * Preferred crop / revert. Enqueue lives only here (imports pending + upload).
 */
import { classifyError, canReachServer } from "@/connectivity";
import { enqueuePreferred } from "@/artistArt/pending";
import { artistArtOverlays } from "@/artistArt/state";
import {
  applyPreferredServerResult,
  deletePreferredArtistImage,
  postPreferredArtistImage,
  PreferredRequestError,
} from "@/artistArt/upload";
import { showToast } from "@/stores/ui";
import type { Artist } from "@/models/artist";

function statusOf(err: unknown): number | undefined {
  return err instanceof PreferredRequestError ? err.status : undefined;
}

function failToast(kind: string, failLabel: string) {
  if (kind === "item_fail") showToast(failLabel);
  else if (kind === "abort") showToast("Cancelled");
  else if (kind === "offline") showToast("Offline");
  else showToast("Can't reach server");
}

function enqueueArgs(artist: Artist) {
  const overlay = artistArtOverlays.get(artist.id);
  const hasPreferred = overlay?.hasPreferred ?? !!artist.hasPreferredImage;
  const preferredRev = overlay?.preferredRev ?? artist.preferredRev ?? 0;
  return {
    artistId: artist.id,
    name: artist.name,
    hasLiveOverride: hasPreferred,
    hasPreferred,
    preferredRev,
  };
}

async function enqueueAndToast(
  artist: Artist,
  action: "upload" | "revert",
  blob?: Blob,
) {
  await enqueuePreferred({ ...enqueueArgs(artist), action, blob });
  showToast(
    action === "upload"
      ? "Photo will upload when the server is back"
      : "Library photo will return when the server is back",
  );
}

export async function submitPreferredCrop(artist: Artist, blob: Blob) {
  if (!canReachServer()) {
    await enqueueAndToast(artist, "upload", blob);
    return;
  }
  try {
    const { artist: dict } = await postPreferredArtistImage(artist.id, blob);
    applyPreferredServerResult(artist.id, dict);
  } catch (err: unknown) {
    const kind = classifyError(err, statusOf(err));
    if (kind === "offline" || kind === "server_down") {
      await enqueueAndToast(artist, "upload", blob);
      return;
    }
    failToast(kind, "Couldn't save that photo");
  }
}

export async function submitPreferredRevert(artist: Artist) {
  if (!canReachServer()) {
    await enqueueAndToast(artist, "revert");
    return;
  }
  try {
    const { artist: dict } = await deletePreferredArtistImage(artist.id);
    applyPreferredServerResult(artist.id, dict);
  } catch (err: unknown) {
    const kind = classifyError(err, statusOf(err));
    if (kind === "offline" || kind === "server_down") {
      await enqueueAndToast(artist, "revert");
      return;
    }
    failToast(kind, "Couldn't use the library photo");
  }
}
