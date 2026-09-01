/**
 * Artist list/grid/tree action items. Owner of order and run() wiring.
 */
import { pickImageFile, openCropFromFile } from "@/artistArt/pickFile";
import { menuHasPreferred } from "@/artistArt/state";
import { submitPreferredCrop, submitPreferredRevert } from "@/artistArt/submit";
import { collectArtistDownloadTracks } from "@/components/library/libraryActions";
import { copyAction } from "@/components/menu/copyItems";
import { downloadTracks } from "@/downloads/ui";
import { confirmDialog } from "@/stores/dialog";
import { showToast } from "@/stores/ui";
import type { ActionItem } from "@/components/menu/actionItem";
import type { Artist } from "@/models/artist";
import { queueActionsAllowed } from "@/playback/session";

export function downloadAllOutcome(
  remaining: number,
  playableCount: number,
): "nothing" | "already" | "confirm" {
  if (remaining === 0 && playableCount === 0) return "nothing";
  if (remaining === 0) return "already";
  return "confirm";
}

/** Online host passes this as downloadAll. Downloads hosts omit it. */
export async function runArtistDownloadAll(artist: Artist): Promise<void> {
  const { remaining, playableCount } = await collectArtistDownloadTracks(
    artist.id,
  );
  const outcome = downloadAllOutcome(remaining.length, playableCount);
  if (outcome === "nothing") {
    showToast("Nothing to download");
    return;
  }
  if (outcome === "already") {
    showToast("Already downloaded");
    return;
  }
  const n = remaining.length;
  const ok = await confirmDialog({
    title: `Download ${artist.name}?`,
    message: `${n} tracks will be saved on this device. Already downloaded tracks are skipped.`,
    confirmLabel: "Download",
  });
  if (!ok) return;
  await downloadTracks(remaining);
}

export function buildArtistMenuItems({
  artist,
  includePhoto,
  addAll,
  playAll,
  downloadAll,
}: {
  artist: Artist;
  includePhoto: boolean;
  addAll: () => void | Promise<void>;
  playAll: () => void | Promise<void>;
  downloadAll?: () => void | Promise<void>;
}): ActionItem[] {
  const items: ActionItem[] = [];
  if (queueActionsAllowed()) {
    items.push({
      id: "add-all",
      label: "Add all to playlist",
      icon: "plus",
      run: () => addAll(),
    });
  }
  items.push({
    id: "play-all",
    label: "Play all",
    icon: "play",
    run: () => playAll(),
  });

  if (downloadAll) {
    items.push({
      id: "download-all",
      label: "Download all",
      icon: "download",
      run: () => downloadAll(),
    });
  }

  const copy = copyAction({
    id: "copy-artist",
    label: "Copy artist name",
    value: artist.name,
  });
  if (copy) items.push(copy);

  if (includePhoto && !artist.isVa) {
    items.push({
      id: "change-photo",
      label: "Change artist photo",
      icon: "edit",
      run: async () => {
        const file = await pickImageFile();
        if (!file) return;
        const blob = await openCropFromFile(file);
        if (!blob) return;
        await submitPreferredCrop(artist, blob);
      },
    });

    if (menuHasPreferred(artist)) {
      items.push({
        id: "use-library",
        label: "Use library photo",
        run: async () => {
          const ok = await confirmDialog({
            title: "Use library photo?",
            message: `Remove your photo for ${artist.name}? The library portrait will show instead.`,
            confirmLabel: "Use library photo",
          });
          if (!ok) return;
          await submitPreferredRevert(artist);
        },
      });
    }
  }

  return items;
}
