import { describe, expect, it } from "vitest";
import {
  buildCdromFileMenuItems,
  buildCdromFolderMenuItems,
  buildCdromQueueMenuItems,
} from "@/components/cd/cdromMenuItems";

describe("cdrom menu items", () => {
  it("file menu is Add only", () => {
    const items = buildCdromFileMenuItems({ add: () => {} });
    expect(items.map((i) => i.id)).toEqual(["add"]);
    expect(items.some((i) => /download|save|go to/i.test(i.label))).toBe(false);
  });

  it("folder menu is Add all and Play all", () => {
    const items = buildCdromFolderMenuItems({
      addAll: () => {},
      playAll: () => {},
    });
    expect(items.map((i) => i.id)).toEqual(["add-all", "play-all"]);
    expect(items.some((i) => /download|save|go to/i.test(i.label))).toBe(false);
  });

  it("queue menu has no Download/Save/Go to", () => {
    const items = buildCdromQueueMenuItems({ remove: () => {} });
    expect(items.map((i) => i.id)).toEqual(["remove"]);
    expect(items.some((i) => /download|save|go to/i.test(i.label))).toBe(false);
  });
});
