import { afterEach, describe, expect, it } from "vitest";
import { isConstrainedConnection } from "@/networkConstraints";

describe("networkConstraints", () => {
  afterEach(() => {
    delete (globalThis as { navigator?: unknown }).navigator;
  });

  it("is unconstrained when navigator is missing", () => {
    delete (globalThis as { navigator?: unknown }).navigator;
    expect(isConstrainedConnection()).toBe(false);
  });

  it("is constrained on cellular or saveData", () => {
    (globalThis as { navigator: object }).navigator = {
      connection: { type: "cellular" },
    };
    expect(isConstrainedConnection()).toBe(true);

    (globalThis as { navigator: object }).navigator = {
      connection: { type: "wifi", saveData: true },
    };
    expect(isConstrainedConnection()).toBe(true);

    (globalThis as { navigator: object }).navigator = {
      connection: { type: "wifi" },
    };
    expect(isConstrainedConnection()).toBe(false);
  });
});
