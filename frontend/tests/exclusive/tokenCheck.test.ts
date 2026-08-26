import { describe, expect, it } from "vitest";
import { tokenCheckReason, tokenCheckTone } from "@/exclusive/tokenCheck";

describe("tokenCheckReason", () => {
  it("maps each probe state to the Settings copy", () => {
    expect(tokenCheckReason("idle")).toBe("");
    expect(tokenCheckReason("checking")).toBe("Checking token…");
    expect(tokenCheckReason("accepted")).toBe("Token accepted");
    expect(tokenCheckReason("invalid")).toBe("Invalid token");
    expect(tokenCheckReason("unreachable")).toBe("Companion not reachable");
  });
});

describe("tokenCheckTone", () => {
  it("paints only accepted / failed results", () => {
    expect(tokenCheckTone("idle")).toBe("neutral");
    expect(tokenCheckTone("checking")).toBe("neutral");
    expect(tokenCheckTone("accepted")).toBe("ok");
    expect(tokenCheckTone("invalid")).toBe("bad");
    expect(tokenCheckTone("unreachable")).toBe("bad");
  });
});
