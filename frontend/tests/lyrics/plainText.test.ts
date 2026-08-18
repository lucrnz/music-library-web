import { describe, expect, it } from "vitest";
import { lyricsClipboardText, syncedLrcToPlainText } from "@/lyrics/plainText";
import { emptyLyrics, type Lyrics } from "@/models/lyrics";

function lyrics(partial: Partial<Lyrics>): Lyrics {
  return { ...emptyLyrics("t1"), status: "ok", ...partial };
}

describe("syncedLrcToPlainText", () => {
  it("strips timestamps and joins lines", () => {
    expect(syncedLrcToPlainText("[00:01.00]Hi\n[00:02.00]There")).toBe(
      "Hi\nThere",
    );
  });

  it("drops empty and ♪ placeholders", () => {
    expect(syncedLrcToPlainText("[00:01.00]\n[00:02.00]♪\n[00:03.00]Hi")).toBe(
      "Hi",
    );
  });

  it("collapses consecutive duplicate texts", () => {
    expect(
      syncedLrcToPlainText("[00:01.00][00:02.00]Hi\n[00:03.00]Hi\n[00:04.00]Lo"),
    ).toBe("Hi\nLo");
  });

  it("keeps a later repeated chorus", () => {
    expect(
      syncedLrcToPlainText("[00:01.00]Hi\n[00:02.00]Lo\n[00:03.00]Hi"),
    ).toBe("Hi\nLo\nHi");
  });
});

describe("lyricsClipboardText", () => {
  it("prefers flattened synced over plainText", () => {
    expect(
      lyricsClipboardText(
        lyrics({
          syncedLrc: "[00:01.00]Synced",
          plainText: "Plain",
        }),
      ),
    ).toBe("Synced");
  });

  it("falls back to plainText when flatten is empty", () => {
    expect(
      lyricsClipboardText(lyrics({ syncedLrc: "[ar:x]", plainText: "Plain" })),
    ).toBe("Plain");
  });

  it("returns null for hide statuses", () => {
    expect(lyricsClipboardText(lyrics({ status: "instrumental" }))).toBeNull();
    expect(
      lyricsClipboardText(lyrics({ instrumental: true, status: "ok" })),
    ).toBeNull();
    expect(lyricsClipboardText(lyrics({ status: "error" }))).toBeNull();
    expect(lyricsClipboardText(lyrics({ status: "not_found" }))).toBeNull();
    expect(lyricsClipboardText(lyrics({ status: "skipped" }))).toBeNull();
    expect(lyricsClipboardText(lyrics({ status: "pending" }))).toBeNull();
  });
});
