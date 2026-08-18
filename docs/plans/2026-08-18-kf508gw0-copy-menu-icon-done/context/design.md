**Archive.** Decisions in this file were current as of 2026-08-18 (the plan date in the directory name). They may be outdated. Do not treat this as living documentation. This plan directory is an archive.

# Copy menu icon

## Goal

Give every ActionMenu copy row the same leading icon treatment as Add, Download, and Go to — a dedicated copy glyph — so copy actions no longer look like unlabeled leftovers.

## Settled decisions

- **One new sprite.** Add `i-copy` to the HTML sprite in `frontend/index.html` (24×24, `currentColor`, two-rectangle “copy / duplicate” mark, same visual weight as `i-plus` / `i-download`). Do not reuse `save` or `edit`.
- **`copyAction` always sets `icon: "copy"`.** Callers do not pass an icon. No override.
- **Copy lyrics uses the same `icon: "copy"`.** It is a hand-built `ActionItem` in `nowPlayingMenuItems.ts`, not a `copyAction` result; set the field there.
- **ActionMenu only.** Settings diagnostic Copy pills stay text-only. They are not `ActionMenu` items.
- **No second glyph.** Title, artist, album, folder path, and lyrics all share `copy`.

## Design

`ActionMenuItem` already renders `<Icon v-if="item.icon">` via `#i-${name}`. Copy rows skip the icon because `copyAction` never sets `icon` and the sprite has no `copy` symbol.

Add the symbol once. Set `icon: "copy"` in the one helper that builds almost every copy row. Set it on the Copy lyrics item so that menu is not the one exception.

Icon smoke does not enumerate the sprite; it only checks `href` construction. Builder tests should assert `icon === "copy"` on copy items so a future omit cannot regress silently.

## Stage map

Glyph first so wiring has something to point at. Living docs last so conventions describe the shipped sprite name.

1. **Sprite + `copyAction` + Copy lyrics** — one visual change; every ActionMenu copy row lights up together.
2. **Living docs** — one conventions sentence so the old “label-only copy” rule cannot be rediscovered from the previous plan.

## Out of scope

- Settings diagnostic Copy pills
- A distinct lyrics glyph
- Changing copy labels, order, or toast copy
- New npm icon package

## Assumptions

- None
