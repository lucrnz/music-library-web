import { describe, expect, it } from "vitest";
import { parseLrc } from "@/lyrics/parseLrc";

describe("parseLrc", () => {
  it("parses a timed line", () => {
    expect(parseLrc("[00:01.00]Hi")).toEqual([{ t: 1, text: "Hi" }]);
  });

  it("duplicates text for two stamps on one line", () => {
    expect(parseLrc("[00:01.00][00:02.00]Hi")).toEqual([
      { t: 1, text: "Hi" },
      { t: 2, text: "Hi" },
    ]);
  });

  it("ignores meta tags and empty input", () => {
    expect(parseLrc("[ar:x]\n[00:01.00]Hi")).toEqual([{ t: 1, text: "Hi" }]);
    expect(parseLrc(null)).toEqual([]);
    expect(parseLrc("")).toEqual([]);
  });
});
