import { describe, expect, it } from "vitest";

import {
  buildRangeChips,
  monthChipLabel,
  parseStatsRange,
} from "@/listens/rangeChips";

describe("parseStatsRange", () => {
  it("accepts all / 7d / 30d / YYYY-MM", () => {
    expect(parseStatsRange("all")).toBe("all");
    expect(parseStatsRange("7d")).toBe("7d");
    expect(parseStatsRange("30d")).toBe("30d");
    expect(parseStatsRange("2026-08")).toBe("2026-08");
  });

  it("treats missing and invalid as all", () => {
    expect(parseStatsRange(undefined)).toBe("all");
    expect(parseStatsRange("")).toBe("all");
    expect(parseStatsRange("99-1")).toBe("all");
    expect(parseStatsRange("2026-13")).toBe("all");
    expect(parseStatsRange("2026-00")).toBe("all");
  });
});

describe("monthChipLabel", () => {
  it("uses the month word for the current year", () => {
    expect(monthChipLabel("2026-08", 2026)).toBe("August");
  });

  it("prefixes prior years with a hyphen", () => {
    expect(monthChipLabel("2025-12", 2026)).toBe("2025 - December");
  });
});

describe("buildRangeChips", () => {
  it("puts fixed chips first then months newest-first as given", () => {
    expect(
      buildRangeChips({
        months: ["2026-08", "2025-12"],
        currentYear: 2026,
      }).map((chip) => chip.range),
    ).toEqual(["all", "7d", "30d", "2026-08", "2025-12"]);
    expect(
      buildRangeChips({ months: ["2026-08"], currentYear: 2026 }).map(
        (chip) => chip.label,
      ),
    ).toEqual(["All-time", "Last 7 days", "Last 30 days", "August"]);
  });

  it("does not invent empty months", () => {
    expect(buildRangeChips({ months: [], currentYear: 2026 })).toHaveLength(3);
  });
});
