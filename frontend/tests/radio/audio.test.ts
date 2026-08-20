import { describe, expect, it } from "vitest";
import { shouldIgnoreTransport } from "@/radio/audio";

describe("radio audio latch", () => {
  it("ignores pause/ended while load or seek is in flight", () => {
    expect(shouldIgnoreTransport(true, false)).toBe(true);
    expect(shouldIgnoreTransport(false, true)).toBe(true);
    expect(shouldIgnoreTransport(true, true)).toBe(true);
    expect(shouldIgnoreTransport(false, false)).toBe(false);
  });
});
