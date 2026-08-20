import { describe, expect, it } from "vitest";
import { createFailureCap } from "@/radio/failures";

describe("radio failure cap", () => {
  it("trips at 3 failures in 10s and ignores older ones", () => {
    const cap = createFailureCap(10_000, 3);
    expect(cap.record(1_000)).toBe(false);
    expect(cap.record(2_000)).toBe(false);
    expect(cap.record(3_000)).toBe(true);
    cap.reset();
    expect(cap.record(20_000)).toBe(false);
    expect(cap.record(31_000)).toBe(false);
    expect(cap.record(32_000)).toBe(false);
    expect(cap.record(33_000)).toBe(true);
  });
});
