/**
 * HTML audio.play() rejects that are not a missing/broken stream.
 */
export function isSoftPlayReject(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  return err.name === "NotAllowedError" || err.name === "AbortError";
}
