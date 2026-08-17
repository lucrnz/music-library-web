import { describe, expect, it } from "vitest";
import { PROTOCOL_VERSION, envelope } from "@/exclusive/protocol";

describe("exclusive protocol envelope", () => {
  it("includes type and version", () => {
    const body = envelope("hello", { token: "t" });
    expect(body.type).toBe("hello");
    expect(body.v).toBe(PROTOCOL_VERSION);
    expect(body.token).toBe("t");
  });
});
