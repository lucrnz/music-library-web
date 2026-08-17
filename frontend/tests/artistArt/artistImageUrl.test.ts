import { describe, expect, it } from "vitest";
import { artistImageUrl } from "@/api";

describe("artistImageUrl", () => {
  it("adds rev when preferred is on", () => {
    const url = artistImageUrl(
      { id: "a1", preferred_rev: 1, has_preferred_image: true },
      "thumb",
    );
    expect(url).toContain("rev=1");
    expect(url).toContain("artist_id=a1");
  });

  it("still busts after revert (flag false, rev nonzero)", () => {
    const url = artistImageUrl(
      { id: "a1", preferred_rev: 2, has_preferred_image: false },
      "thumb",
    );
    expect(url).toContain("rev=2");
  });

  it("does not add rev for string ids", () => {
    expect(artistImageUrl("a1")).not.toContain("rev=");
  });

  it("bust still adds t=", () => {
    const url = artistImageUrl(
      { id: "a1", preferred_rev: 1 },
      "thumb",
      true,
    );
    expect(url).toContain("t=");
    expect(url).toContain("rev=1");
  });
});
