/**
 * Download codec filename / MIME helpers (profile tag → container).
 */

export function codecExt(codec) {
  if (typeof codec === "string" && codec.startsWith("flac")) return "flac";
  return "opus";
}

export function codecMediaType(codec) {
  if (typeof codec === "string" && codec.startsWith("flac")) return "audio/flac";
  return "audio/ogg";
}
