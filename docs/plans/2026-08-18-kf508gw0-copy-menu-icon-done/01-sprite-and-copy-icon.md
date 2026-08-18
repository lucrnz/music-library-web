# Stage 01: Sprite and copy ActionItem icon

## Status
done

## Description

Add an `i-copy` symbol to the HTML sprite and set `icon: "copy"` on every ActionMenu copy row (`copyAction` plus the hand-built Copy lyrics item).

## Rationale

The picker already knows how to draw a leading icon. The only missing pieces are the glyph and the field on the items.

## Invariants

- Sprite id is `i-copy`. `Icon` name is `copy` (`#i-` + name).
- Path is Material-style overlapping rectangles, 24×24, `fill="currentColor"`, same weight as `i-plus` / `i-download`.
- `copyAction` always sets `icon: "copy"`. No caller override.
- Copy lyrics sets `icon: "copy"` on its `ActionItem`.
- Settings Copy pills are unchanged.
- No Vue mount tests.

## Risks

- A too-light or outlined path will look thinner than neighboring filled menu icons. Use the filled two-rectangle mark, not a 1px outline.

## Implementation

### Files

- Change: `frontend/index.html` (add `<symbol id="i-copy">` next to the other 24×24 action glyphs)
- Change: `frontend/src/components/menu/copyItems.ts` (`icon: "copy"` on the returned item)
- Change: `frontend/src/components/player/nowPlayingMenuItems.ts` (`icon: "copy"` on Copy lyrics)
- Change: `frontend/tests/library/entityMenuItems.test.ts` (assert copy items have `icon === "copy"`, including Copy lyrics)
- Change: `frontend/tests/library/artistMenuItems.test.ts` and/or `frontend/tests/playlist/queueMenuItems.test.ts` if those files already inspect item shape beyond ids

Suggested path (Material `content_copy`, matches existing sprite style):

```xml
<symbol id="i-copy" viewBox="0 0 24 24">
  <path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z" fill="currentColor"/>
</symbol>
```

### Steps

1. Insert `i-copy` in the hidden sprite in `frontend/index.html`.
2. Set `icon: "copy"` in `copyAction`’s returned `ActionItem`.
3. Set `icon: "copy"` on the Copy lyrics item.
4. Extend builder tests: every `id` starting with `copy-` has `icon === "copy"`.

### Verify

```sh
pnpm --dir frontend typecheck
pnpm --dir frontend test
```

Manually: open an artist `⋯`, a queue `⋯`, and now-playing `⋯`. Every Copy … row shows the copy glyph at the same size and alignment as Add / Go to. Settings diagnostic Copy pills are unchanged.

## Acceptance

- [ ] `i-copy` exists in the sprite and `Icon name="copy"` resolves to `#i-copy`.
- [ ] `copyAction` always sets `icon: "copy"`. Copy lyrics does too.
- [ ] Builder tests fail if a copy item is missing the icon.
- [ ] Settings Copy pills are unchanged.
