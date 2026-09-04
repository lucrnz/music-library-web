import { describe, expect, it } from "vitest";
import { formatCdromLabel } from "@/cd/cdrom";

describe("formatCdromLabel", () => {
  it("falls back to filename stem before tags", () => {
    expect(formatCdromLabel({ name: "01.mp3" })).toBe("01");
  });

  it("uses title then artist then album", () => {
    expect(formatCdromLabel({ name: "01.mp3", title: "Song" })).toBe("Song");
    expect(
      formatCdromLabel({ name: "01.mp3", title: "Song", artist: "Band" }),
    ).toBe("Song - Band");
    expect(
      formatCdromLabel({
        name: "01.mp3",
        title: "Song",
        artist: "Band",
        album: "LP",
      }),
    ).toBe("Song - Band [LP]");
  });

  it("drops missing artist or album segments", () => {
    expect(
      formatCdromLabel({ name: "01.mp3", title: "Song", album: "LP" }),
    ).toBe("Song [LP]");
  });
});
