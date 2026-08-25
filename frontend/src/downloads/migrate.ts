/**
 * Move leftover OPFS locker files onto the companion blob store.
 */
import {
  albumArtBlobKey,
  artistArtBlobKey,
  audioBlobKey,
  deleteKey,
  putBytes,
} from "@/downloads/companionBlob";
import {
  albumCoverDirParts,
  albumCoverFileName,
  artistCoverDirParts,
  artistCoverFileName,
  audioDirParts,
  audioFileName,
  readBinary,
  wipeOpfsDownloads,
} from "@/downloads/opfs";
import { codecExt } from "@/downloads/media";
import {
  listAlbumRecords,
  listArtistRecords,
  listTrackRecords,
} from "@/downloads/writer";
import { downloads } from "@/downloads/state";
import { exclusiveAudio } from "@/stores/exclusiveAudio";

export interface LeftoverSpec {
  key: string;
  dirParts: string[];
  fileName: string;
}

export function leftoverSpecsFromRecords(
  tracks: {
    trackId: string;
    codec?: string | null;
    ext?: string | null;
    sourceCodec?: string | null;
    status?: string;
  }[],
  albums: { albumId: string; hasThumb?: boolean; hasFull?: boolean }[],
  artists: { artistId: string; hasThumb?: boolean }[],
): LeftoverSpec[] {
  const specs: LeftoverSpec[] = [];
  for (const t of tracks) {
    if (!t.codec) continue;
    const ext = t.ext || codecExt(t.codec, t.sourceCodec);
    specs.push({
      key: audioBlobKey(t.trackId, t.codec, ext),
      dirParts: audioDirParts(),
      fileName: audioFileName(t.trackId, t.codec, ext),
    });
  }
  for (const al of albums) {
    if (al.hasThumb) {
      specs.push({
        key: albumArtBlobKey(al.albumId, "thumb"),
        dirParts: albumCoverDirParts(),
        fileName: albumCoverFileName(al.albumId, "thumb"),
      });
    }
    if (al.hasFull) {
      specs.push({
        key: albumArtBlobKey(al.albumId, "full"),
        dirParts: albumCoverDirParts(),
        fileName: albumCoverFileName(al.albumId, "full"),
      });
    }
  }
  for (const ar of artists) {
    if (ar.hasThumb) {
      specs.push({
        key: artistArtBlobKey(ar.artistId, "thumb"),
        dirParts: artistCoverDirParts(),
        fileName: artistCoverFileName(ar.artistId, "thumb"),
      });
    }
  }
  return specs;
}

export async function listOpfsLeftovers(): Promise<LeftoverSpec[]> {
  const tracks = await listTrackRecords();
  const albums = await listAlbumRecords();
  const artists = await listArtistRecords();
  const specs = leftoverSpecsFromRecords(tracks, albums, artists);
  const found: LeftoverSpec[] = [];
  for (const spec of specs) {
    const blob = await readBinary(spec.dirParts, spec.fileName);
    if (blob && blob.size > 0) found.push(spec);
  }
  return found;
}

let migrateAbort: AbortController | null = null;

export async function migrateOpfsToCompanion(): Promise<boolean> {
  if (exclusiveAudio.connection !== "connected") {
    downloads.migrate = {
      active: false,
      done: 0,
      total: 0,
      error: "Start the Desktop companion to migrate.",
    };
    return false;
  }
  const leftovers = await listOpfsLeftovers();
  if (!leftovers.length) {
    downloads.hasOpfsLeftovers = false;
    return true;
  }
  migrateAbort = new AbortController();
  const written: string[] = [];
  downloads.migrate = {
    active: true,
    done: 0,
    total: leftovers.length,
    error: "",
  };
  try {
    for (const spec of leftovers) {
      if (migrateAbort.signal.aborted) throw new Error("cancelled");
      const blob = await readBinary(spec.dirParts, spec.fileName);
      if (!blob) {
        downloads.migrate.done += 1;
        continue;
      }
      written.push(spec.key);
      await putBytes(spec.key, blob, migrateAbort.signal);
      downloads.migrate.done += 1;
    }
    await wipeOpfsDownloads();
    downloads.hasOpfsLeftovers = false;
    downloads.migrate = { active: false, done: leftovers.length, total: leftovers.length, error: "" };
    return true;
  } catch (err: unknown) {
    for (const key of written) {
      try {
        deleteKey(key);
      } catch {
        /* best effort */
      }
    }
    const message = err instanceof Error ? err.message : String(err);
    const cancelled =
      message === "cancelled" ||
      (err instanceof DOMException && err.name === "AbortError") ||
      (err instanceof Error && err.name === "AbortError");
    downloads.migrate = {
      active: false,
      done: downloads.migrate.done,
      total: leftovers.length,
      error: cancelled ? "" : message,
    };
    return false;
  } finally {
    migrateAbort = null;
  }
}

export function cancelMigrate(): void {
  migrateAbort?.abort();
}

export async function refreshLeftoverFlag(): Promise<boolean> {
  try {
    const left = await listOpfsLeftovers();
    downloads.hasOpfsLeftovers = left.length > 0;
    return downloads.hasOpfsLeftovers;
  } catch {
    downloads.hasOpfsLeftovers = false;
    return false;
  }
}
