/**
 * Download filename extension and MIME for a stored codec tag.
 */
import { SOURCE_TAG, sourceFileMedia } from "@/lossyKind";

export function codecExt(codec: string, sourceCodec?: string | null) {
  if (codec === SOURCE_TAG) return sourceFileMedia(sourceCodec).ext;
  if (typeof codec === "string" && codec.startsWith("flac")) return "flac";
  return "opus";
}

export function codecMediaType(codec: string, sourceCodec?: string | null) {
  if (codec === SOURCE_TAG) return sourceFileMedia(sourceCodec).mediaType;
  if (typeof codec === "string" && codec.startsWith("flac")) return "audio/flac";
  return "audio/ogg";
}
