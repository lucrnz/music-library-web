/**
 * Downloads track helpers.
 * Track shape lives in models/track.js — re-exported here for compat.
 */

export {
  artistIdsOf,
  fromApiTrack,
  fromCatalogRecord,
  mapTracks,
  normalizeTrack,
  primaryArtistIdOf,
  primaryArtistNameOf,
} from "../models/track.js";

export function codecExt(codec) {
  if (typeof codec === "string" && codec.startsWith("flac")) return "flac";
  return "opus";
}

export function codecMediaType(codec) {
  if (typeof codec === "string" && codec.startsWith("flac")) return "audio/flac";
  return "audio/ogg";
}
