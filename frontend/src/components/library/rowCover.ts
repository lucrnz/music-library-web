/** Row cover: omitted/null = remote fallback; "" = placeholder. */
const PLACEHOLDER = "/static/img/placeholder.svg";

export function resolveRowCover(
  coverSrc: string | null | undefined,
  fallback: string,
): string {
  if (coverSrc != null) return coverSrc || PLACEHOLDER;
  return fallback;
}
