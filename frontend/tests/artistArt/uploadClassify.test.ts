import { afterEach, describe, expect, it, vi } from "vitest";
import { classifyError } from "@/connectivity";
import { PreferredRequestError } from "@/artistArt/upload";

vi.mock("@/diag/log", () => ({
  emit: () => {},
}));

describe("PreferredRequestError + classifyError", () => {
  afterEach(() => {
    delete (globalThis as { navigator?: unknown }).navigator;
  });

  it("maps 413/400 to item_fail and 5xx to server_down", () => {
    const e413 = new PreferredRequestError("too large", 413);
    const e400 = new PreferredRequestError("bad", 400);
    const e500 = new PreferredRequestError("down", 500);
    expect(classifyError(e413, e413.status)).toBe("item_fail");
    expect(classifyError(e400, e400.status)).toBe("item_fail");
    expect(classifyError(e500, e500.status)).toBe("server_down");
    expect(e413.status).toBe(413);
  });
});
