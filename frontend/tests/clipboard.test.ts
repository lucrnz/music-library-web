import { beforeEach, describe, expect, it, vi } from "vitest";

const showToast = vi.hoisted(() => vi.fn());

vi.mock("@/stores/ui", () => ({ showToast }));

import { copyText } from "@/clipboard";

describe("copyText", () => {
  beforeEach(() => {
    showToast.mockReset();
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: vi.fn().mockResolvedValue(undefined) },
    });
  });

  it("writes and toasts Copied", async () => {
    const ok = await copyText("hello");
    expect(ok).toBe(true);
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith("hello");
    expect(showToast).toHaveBeenCalledWith("Copied");
  });

  it("toasts Could not copy when writeText throws", async () => {
    vi.mocked(navigator.clipboard.writeText).mockRejectedValue(new Error("denied"));
    const ok = await copyText("hello");
    expect(ok).toBe(false);
    expect(showToast).toHaveBeenCalledWith("Could not copy");
  });

  it("does not write or toast for an empty string", async () => {
    const ok = await copyText("");
    expect(ok).toBe(false);
    expect(navigator.clipboard.writeText).not.toHaveBeenCalled();
    expect(showToast).not.toHaveBeenCalled();
  });
});
