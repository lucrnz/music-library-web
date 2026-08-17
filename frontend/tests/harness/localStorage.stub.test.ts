import { describe, expect, it } from "vitest";

describe("node localStorage stub", () => {
  it("round-trips setItem / getItem / removeItem", () => {
    localStorage.setItem("k", "v");
    expect(localStorage.getItem("k")).toBe("v");
    localStorage.removeItem("k");
    expect(localStorage.getItem("k")).toBeNull();
  });
});
