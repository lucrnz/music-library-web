import { describe, expect, it } from "vitest";
import { needsReseek } from "@/radio/sync";

describe("radio drift", () => {
  it("reseeks only when |heard − official| > 2s", () => {
    expect(needsReseek(10, 11.5)).toBe(false);
    expect(needsReseek(10, 12)).toBe(false);
    expect(needsReseek(10, 12.01)).toBe(true);
    expect(needsReseek(30, 27.9)).toBe(true);
  });
});
