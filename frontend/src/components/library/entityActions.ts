/**
 * Shared entity-menu itemsFor for list and tree hosts.
 */
import { buildAlbumMenuItems } from "@/components/library/albumMenuItems";
import { buildArtistMenuItems } from "@/components/library/artistMenuItems";
import type { BrowseSource } from "@/components/library/browseSource";
import { type OpenMenu } from "@/components/library/entityMenu";
import { buildFolderMenuItems } from "@/components/library/folderMenuItems";
import { queueOnly } from "@/components/library/rows";
import { buildTrackMenuItems } from "@/components/library/trackMenuItems";
import type { ActionItem } from "@/components/menu/actionItem";

export function entityActionsFor(
  source: BrowseSource,
  ctx: { downloadsEnabled: boolean; includePhoto: boolean },
): (target: OpenMenu) => ActionItem[] {
  return (target) => {
    switch (target.kind) {
      case "artist":
        return buildArtistMenuItems({
          artist: target.artist,
          includePhoto: ctx.includePhoto,
          addAll: () => source.artistAddAll(target.artist.id),
          playAll: () => source.artistPlayAll(target.artist.id),
          downloadAll:
            ctx.downloadsEnabled && source.artistDownloadAll
              ? () => source.artistDownloadAll!(target.artist)
              : undefined,
        });
      case "album":
        return buildAlbumMenuItems({
          album: target.album,
          addAll: () => source.albumAddAll(target.album.id),
          playAll: () => source.albumPlayAll(target.album.id),
          download:
            ctx.downloadsEnabled && source.albumDownload
              ? () => source.albumDownload!(target.album)
              : undefined,
        });
      case "track":
        return buildTrackMenuItems({
          title: target.track.title,
          artist: target.track.artist,
          album: target.track.album,
          addToPlaylist: () => queueOnly(target.track),
        });
      case "file": {
        const t = target.file.track;
        return buildTrackMenuItems({
          title: t?.title || target.file.displayName || target.file.name,
          artist: t?.artist,
          album: t?.album,
          addToPlaylist: () =>
            queueOnly(t || target.file.id || target.file.path),
        });
      }
      case "folder":
        return buildFolderMenuItems({
          dir: target.dir,
          addAll: () => source.folderAddAll?.(target.dir.path || ""),
          playAll: () => source.folderPlayAll?.(target.dir.path || ""),
        });
    }
  };
}
