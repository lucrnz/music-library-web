/**
 * Parse LRC timed lyrics into { t, text } lines.
 */

const TIME_RE = /\[(\d{1,2}):(\d{2})(?:[.:](\d{1,3}))?\]/g;
const META_RE = /^\[[a-zA-Z][^:\]]*:[^\]]*\]\s*$/;

export interface LrcLine {
  t: number;
  text: string;
}

/** @returns fractional seconds */
function fracSeconds(stamp: string | undefined): number {
  if (!stamp) return 0;
  if (stamp.length <= 2) return Number(stamp) / 100;
  return Number(stamp) / 1000;
}

export function parseLrc(lrc: string | null | undefined): LrcLine[] {
  if (!lrc || typeof lrc !== "string") return [];
  const lines: LrcLine[] = [];
  for (const raw of lrc.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || META_RE.test(line)) continue;
    TIME_RE.lastIndex = 0;
    const times: number[] = [];
    let match: RegExpExecArray | null;
    let lastIndex = 0;
    while ((match = TIME_RE.exec(line)) !== null) {
      const mm = Number(match[1]);
      const ss = Number(match[2]);
      const t = mm * 60 + ss + fracSeconds(match[3]);
      times.push(t);
      lastIndex = match.index + match[0].length;
    }
    if (!times.length) continue;
    const text = line.slice(lastIndex).trim();
    for (const t of times) {
      lines.push({ t, text });
    }
  }
  lines.sort((a, b) => a.t - b.t);
  return lines;
}

/**
 * Index of the active line for currentTime (last line with t <= currentTime).
 * @returns index or -1
 */
export function activeLineIndex(
  lines: Array<{ t: number }>,
  currentTime: number,
): number {
  if (!lines.length || !Number.isFinite(currentTime)) return -1;
  let lo = 0;
  let hi = lines.length - 1;
  let ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (lines[mid].t <= currentTime) {
      ans = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return ans;
}
