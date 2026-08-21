import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { preparedKeys, requestForget } from "@/api";

describe("requestForget", () => {
  beforeEach(() => {
    preparedKeys.clear();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({}),
        text: async () => "",
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("posts unique ids and drops matching preparedKeys", () => {
    preparedKeys.add("a|opus_192_48000");
    preparedKeys.add("a|flac_16_44100");
    preparedKeys.add("b|opus_192_48000");
    requestForget(["a", "a", ""]);
    expect([...preparedKeys]).toEqual(["b|opus_192_48000"]);
    expect(fetch).toHaveBeenCalledWith(
      "/api/transcode/forget",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ ids: ["a"] }),
      }),
    );
  });

  it("chunks at 1000 ids", () => {
    const ids = Array.from({ length: 1001 }, (_, i) => `t${i}`);
    requestForget(ids);
    expect(fetch).toHaveBeenCalledTimes(2);
    const bodies = vi
      .mocked(fetch)
      .mock.calls.map(([, init]) => JSON.parse(String(init?.body)).ids as string[]);
    expect(bodies[0]).toHaveLength(1000);
    expect(bodies[1]).toEqual(["t1000"]);
  });

  it("no-ops on an empty list", () => {
    requestForget([]);
    expect(fetch).not.toHaveBeenCalled();
  });
});
