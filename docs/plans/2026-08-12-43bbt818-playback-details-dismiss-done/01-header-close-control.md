# Stage 01: Header close control

## Status
done

## Description

Replace the mobile Playback details footer **Close** (`pill primary` in `dialog-actions`) with a Settings/Downloads-style header dismiss control.

In `PlaybackStatusLine.js`, restructure only the **mobile** teleported modal sheet (`np-playback-details-modal` / `np-playback-details-sheet`):

- Use `modal-head` + `modal-title` + `icon-btn` for the title row.
- Title text remains **Playback details**; keep a stable `id` for `aria-labelledby` (e.g. `np-playback-details-title` on the title element).
- Close control: single `Icon` with `name="close"` (always X — this surface is a centered info card, not a bottom sheet). Do **not** use the Settings dual `modal-close-sheet` / `modal-close-card` pair.
- Wire `@click="closeDetails"`; keep `ref="detailsCloseBtn"` on the icon button so open still focuses the dismiss control.
- Suitable `title` / `aria-label` (e.g. "Close playback details").
- **Remove** the entire `dialog-actions` footer and the footer Close button.
- Leave backdrop click, Escape, and status-chip toggle dismiss paths unchanged.
- Leave the **desktop** popover path unchanged (no Close button).

## Rationale

The sheet is read-only metadata. A primary footer CTA reuses confirm-dialog chrome and reads as a decision action. Matching header icon dismiss with other modals makes the affordance correct without inventing a new pattern.

## Implementation

- Edit `src/musicweb/static/js/components/player/PlaybackStatusLine.js` mobile modal block only (the `Teleport` template around `np-playback-details-modal`).
- Mirror structure from `SettingsModal.js` head chrome, but only the X icon (no chevron).
- Ensure `Icon` is already imported/registered (it is).
- Confirm `openDetails` still does `nextTick(() => detailsCloseBtn.value?.focus?.())` after open on mobile.
- Do not change `closeDetails`, modal lock, desktop popover, or `PlaybackDetailsBody`.
- Manual check: open details from now-playing status on a narrow viewport; header X, backdrop, and Escape all dismiss; focus lands on the X on open.
