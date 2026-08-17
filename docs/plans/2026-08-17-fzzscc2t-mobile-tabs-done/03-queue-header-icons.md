# Stage 03: Queue header icons on mobile

## Status
done

## Description

Below 900px, the queue view-bar keeps **Queue** as the title and turns Download / Save / Edit / Clear all into icon-only controls with `aria-label`. At 900px and above, the same buttons keep their labeled pills.

## Rationale

After stage 01 the queue header is full width, but Download + Save + Edit still overflow a ~360px bar. Icon-only actions were the settled way to stay on one row. See [context/design.md](context/design.md).

## Invariants

- Breakpoint is the existing `(min-width: 900px)` / `DESKTOP_MEDIA`. Do not invent a second width.
- Button set and handlers stay the same (Download still gated on `downloads.enabled && pl.length`; Clear all still only while editing and the queue is non-empty).
- `Icon` stays `#i-` + `name` against the sprite in `frontend/index.html`. No new npm icon pack.
- No second header row, no `⋯` overflow menu, no horizontal scroll of the actions.

## Risks

- Clear all is text-only today. Hiding `span` without adding an icon leaves a blank control.
- There is no save glyph in the sprite yet. A missing `#i-save` renders an empty `Icon`.
- Using `display: none` on the label must not remove the accessible name — every icon-only button needs `aria-label` (and `title` may stay).

## Implementation

### Files

- Change: `frontend/index.html` (add `<symbol id="i-save">` next to the other action glyphs)
- Change: `frontend/src/components/playlist/PlaylistView.vue` (Save and Clear all get icons + `aria-label`; Edit/Download already have icons — add `aria-label` if missing)
- Change: `frontend/css/library.css` or `frontend/css/app.css` (mobile-first: hide `#view-playlist .view-actions .pill span`; restore at `min-width: 900px`; tighten pill padding when the label is hidden)

### Steps

1. Add `#i-save` to the inline sprite in `frontend/index.html` (24×24, `fill="currentColor"`, same style as `#i-download`). A floppy/save silhouette is enough. `Icon` will resolve `name="save"`.
2. Save button: prepend `<Icon name="save" />`, keep `<span>Save</span>`, set `aria-label="Save queue as playlist"` (title already exists).
3. Clear all: prepend `<Icon name="trash" />`, keep `<span>Clear all</span>`, set `aria-label="Clear all"`. Do not add a new glyph.
4. Download and Edit already wrap a label in `<span>`. Give Download `aria-label="Download queue"` and Edit `aria-label` that matches the visible string (`Edit` / `Done`).
5. CSS, mobile-first: `#view-playlist .view-actions .pill span { display: none }` and compact the pill (`min-width` / padding so a 36–40px tap target remains). Inside `@media (min-width: 900px)`, show the spans again and restore the current pill padding. Do not hide icons.
6. Do not branch the template on `useDesktopViewport()` for this — PlaylistView already uses that hook for menus; labels are a CSS concern.

### Verify

```sh
pnpm --dir frontend typecheck
```

In a browser:

1. Width ~360px, downloads on, queue non-empty: the bar is **Queue** plus three icons (Download, Save, Edit) on one row; no clipped text; no wrap onto the saved-playlist row.
2. Tap Edit: Clear all appears as the trash icon; Done is the edit icon. Each control’s `aria-label` matches the old visible label.
3. Save and Download still run the existing dialogs / enqueue paths.
4. Width ≥900px: Download / Save / Edit / Clear all show icon + text as they do today.
5. Empty queue, downloads on: Download is absent; Save and Edit remain.

## Acceptance

- [ ] Below 900px, queue actions are icon-only and fit a 360px-wide bar next to the Queue title.
- [ ] At ≥900px, labeled pills are unchanged.
- [ ] `#i-save` exists in `frontend/index.html`; Save is not an empty icon.
- [ ] Every queue action button has an `aria-label` when its text is CSS-hidden.
- [ ] `pnpm --dir frontend typecheck` is clean.
