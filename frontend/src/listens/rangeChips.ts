/** Pure Stats range-chip helpers. */

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;
const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

export type StatsRange = "all" | "7d" | "30d" | string;

export interface RangeChip {
  range: string;
  label: string;
}

export function parseStatsRange(raw: unknown): StatsRange {
  const token = String(raw ?? "").trim();
  if (token === "7d" || token === "30d") return token;
  if (MONTH.test(token)) return token;
  return "all";
}

export function monthChipLabel(key: string, currentYear: number): string {
  if (!MONTH.test(key)) return key;
  const year = Number(key.slice(0, 4));
  const month = Number(key.slice(5, 7));
  const name = MONTH_NAMES[month - 1] || key;
  if (year === currentYear) return name;
  return `${year} - ${name}`;
}

export function buildRangeChips(opts: {
  months: string[];
  currentYear: number;
}): RangeChip[] {
  const chips: RangeChip[] = [
    { range: "all", label: "All-time" },
    { range: "7d", label: "Last 7 days" },
    { range: "30d", label: "Last 30 days" },
  ];
  for (const key of opts.months) {
    if (!MONTH.test(key)) continue;
    chips.push({ range: key, label: monthChipLabel(key, opts.currentYear) });
  }
  return chips;
}

export function currentYearForLabels(timezone: string): number {
  if (timezone && timezone !== "local") {
    try {
      const parts = new Intl.DateTimeFormat("en-US", {
        timeZone: timezone,
        year: "numeric",
      }).formatToParts(new Date());
      const year = Number(parts.find((part) => part.type === "year")?.value);
      if (Number.isFinite(year) && year > 0) return year;
    } catch {
      /* browser local year */
    }
  }
  return new Date().getFullYear();
}
