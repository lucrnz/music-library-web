import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/api", () => ({
  apiGet: vi.fn(),
}));

import {
  exclusiveAudio,
  setCompanionToken,
  setTokenCheck,
} from "@/stores/exclusiveAudio";

describe("setCompanionToken", () => {
  afterEach(() => {
    exclusiveAudio.companionToken = "";
    exclusiveAudio.tokenCheck = "idle";
  });

  it("clears a page-lifetime token check when the value changes", () => {
    exclusiveAudio.companionToken = "old";
    setTokenCheck("accepted");
    setCompanionToken("old");
    expect(exclusiveAudio.tokenCheck).toBe("accepted");
    setCompanionToken("new");
    expect(exclusiveAudio.tokenCheck).toBe("idle");
    expect(exclusiveAudio.companionToken).toBe("new");
  });
});
