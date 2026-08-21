import { describe, expect, it } from "vitest";
import { useEntityMenu } from "@/components/library/useEntityMenu";
import type { OpenMenu } from "@/components/library/entityMenu";

const artist: OpenMenu = {
  kind: "artist",
  artist: { id: "a1", name: "A", album_count: 1, track_count: 2 },
};

describe("useEntityMenu", () => {
  it("opens, toggles closed, and builds items from itemsFor", () => {
    const menu = useEntityMenu({
      itemsFor: (target) =>
        target.kind === "artist"
          ? [{ id: "add", label: "Add all", run: () => undefined }]
          : [],
    });
    const anchor = { kind: "point" as const, x: 1, y: 2 };
    menu.openEntityMenu(artist, anchor);
    expect(menu.menuOpen.value).toBe(true);
    expect(menu.menuKey.value).toBe("artist:a1");
    expect(menu.menuItems.value).toHaveLength(1);
    expect(menu.menuItems.value[0]?.id).toBe("add");

    menu.openEntityMenu(artist, anchor);
    expect(menu.menuOpen.value).toBe(false);
    expect(menu.menuTarget.value).toBeNull();
  });
});
