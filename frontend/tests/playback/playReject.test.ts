import { describe, expect, it } from "vitest";
import { PlayBlockError } from "@/playBlock";
import { isSoftPlayReject } from "@/playback/playReject";

describe("isSoftPlayReject", () => {
  it("is true for NotAllowedError and AbortError", () => {
    const notAllowed = new Error("play blocked");
    notAllowed.name = "NotAllowedError";
    const aborted = new Error("aborted");
    aborted.name = "AbortError";
    expect(isSoftPlayReject(notAllowed)).toBe(true);
    expect(isSoftPlayReject(aborted)).toBe(true);
    expect(isSoftPlayReject(new DOMException("blocked", "NotAllowedError"))).toBe(
      true,
    );
  });

  it("is false for PlayBlockError play_failed", () => {
    expect(isSoftPlayReject(new PlayBlockError("play_failed"))).toBe(false);
  });

  it("is false for a generic Error", () => {
    expect(isSoftPlayReject(new Error("nope"))).toBe(false);
  });

  it("is false for non-errors", () => {
    expect(isSoftPlayReject(null)).toBe(false);
    expect(isSoftPlayReject("AbortError")).toBe(false);
    expect(isSoftPlayReject({ name: "AbortError" })).toBe(false);
  });
});
