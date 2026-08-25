import { describe, expect, it } from "vitest";
import { isCompanionFileUrl } from "@/downloads/companionBlob";

describe("isCompanionFileUrl", () => {
  it("accepts loopback locker URLs", () => {
    expect(
      isCompanionFileUrl("http://127.0.0.1:18765/files/audio/t1.flac.flac?token=x"),
    ).toBe(true);
  });

  it("rejects leftover OPFS blobs and remote streams", () => {
    expect(isCompanionFileUrl("blob:http://localhost/abc")).toBe(false);
    expect(isCompanionFileUrl("/api/stream?id=t1&codec=source")).toBe(false);
    expect(isCompanionFileUrl("https://nas.example/files/audio/t1.flac")).toBe(
      false,
    );
  });
});
