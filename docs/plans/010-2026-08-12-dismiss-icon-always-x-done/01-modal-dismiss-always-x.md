# Stage 01: Modal dismiss always X

## Status
done

## Description

Use a single **X** (`close`) icon for modal dismiss controls on both mobile and desktop. Stop using chevron-down (“V”) for close.

Surfaces:

- **Downloads manager** (`DownloadsModal.js`): close button currently hard-codes `chevron-down` on all breakpoints — switch to `close`.
- **Settings** (`SettingsModal.js`): dual icons (`modal-close-sheet` = chevron-down, `modal-close-card` = close) switched by CSS breakpoint — replace with a single `Icon name="close"`.

Cleanup:

- Remove unused `.modal-close-sheet` / `.modal-close-card` rules from `modal.css` once no markup references them.
- Grep to confirm nothing else uses those classes.

Out of scope for this stage: tree expand chevrons, quality-select dropdown chevrons, now-playing collapse icon (stage 02).

## Rationale

Chevron-down reads as “collapse a bottom sheet” and is wrong on desktop card modals (Downloads always shows V today). X is a universal dismiss glyph that works for sheet and card chrome; one icon removes breakpoint dual-markup and the CSS toggle.

## Implementation

- `src/musicweb/static/js/components/downloads/DownloadsModal.js`: in the modal-head close `icon-btn`, change `<Icon name="chevron-down" />` → `<Icon name="close" />`. Keep title/aria-label (“Close” / “Close downloads”).
- `src/musicweb/static/js/components/settings/SettingsModal.js`: replace the two Icon children with one `<Icon name="close" />`. Drop `modal-close-sheet` / `modal-close-card` classes.
- `src/musicweb/static/css/modal.css`: delete the “Sheet dismiss on mobile; × on desktop card” block (`.modal-close-card` / `.modal-close-sheet` and the `@media (min-width: 900px)` pair) if unused.
- Grep `modal-close-sheet`, `modal-close-card`, and modal close `chevron-down` under `static/` to confirm clean.
- Manual: open Settings and Downloads on a wide viewport and a narrow viewport — both show X; click still closes; backdrop/Esc unchanged.
