import { describe, expect, it } from "vitest";
import { cdromFileUrl, cdTrackUrl } from "@/playback/cdDelivery";
import { PlayBlockError } from "@/playBlock";

describe("cdTrackUrl", () => {
  it("builds a loopback /cdda/ URL", () => {
    const href = cdTrackUrl(18765, "tok", "/dev/rdisk2", 3);
    const url = new URL(href);
    expect(url.protocol).toBe("http:");
    expect(url.hostname).toBe("127.0.0.1");
    expect(url.port).toBe("18765");
    expect(url.pathname).toBe("/cdda/3");
    expect(url.searchParams.get("device")).toBe("/dev/rdisk2");
    expect(url.searchParams.get("token")).toBe("tok");
  });

  it("rejects missing pieces", () => {
    expect(() => cdTrackUrl(0, "t", "d", 1)).toThrow(PlayBlockError);
    expect(() => cdTrackUrl(18765, "", "d", 1)).toThrow(PlayBlockError);
    expect(() => cdTrackUrl(18765, "t", "", 1)).toThrow(PlayBlockError);
    expect(() => cdTrackUrl(18765, "t", "d", 0)).toThrow(PlayBlockError);
  });

  it("builds a loopback /cdrom/file URL", () => {
    const href = cdromFileUrl(18765, "tok", "/dev/rdisk2", "Music/a.mp3");
    const url = new URL(href);
    expect(url.pathname).toBe("/cdrom/file");
    expect(url.searchParams.get("device")).toBe("/dev/rdisk2");
    expect(url.searchParams.get("rel")).toBe("Music/a.mp3");
    expect(url.searchParams.get("token")).toBe("tok");
  });
});
