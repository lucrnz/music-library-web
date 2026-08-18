# Stage 01: Selection CSS and clipboard helper

## Status
done

## Description

Lock text selection on the app shell, opt it back in only for form controls and plain lyrics, and extract Settings’ `navigator.clipboard.writeText` path into a shared helper every later copy action will call.

## Rationale

Without a global lock, every new title or hint reintroduces the webpage highlight. Without one helper, Settings and menu copy will drift on toast wording and error handling.

## Invariants

- Opt-in selectors are exactly `input`, `textarea`, `[contenteditable]`, and `.lyrics-plain`.
- Toasts stay `showToast` from `stores/ui.ts`. Strings are “Copied” and “Could not copy”.
- No Vue chrome tests. No new npm clipboard package.

## Risks

- A too-broad lock can make the search field or dialog prompt unselectable. Those are `<input>`s and must stay in the opt-in list. `AppDialog` still calls `.select()` on the prompt.
- iOS callout can still appear if `-webkit-touch-callout` is not set on the shell and reset on `.lyrics-plain`.

## Implementation

### Files

- Change: `frontend/css/app.css` (`html, body` lock + the one opt-in block)
- Do not change: `frontend/css/player.css` (policy is not split)
- Create: `frontend/src/clipboard.ts` (`copyText`)
- Create: `frontend/tests/clipboard.test.ts`
- Change: `frontend/src/components/settings/SettingsModal.vue` (`copyDiagId` calls `copyText`)

### Steps

1. On `html, body` add `user-select: none`, `-webkit-user-select: none`, and `-webkit-touch-callout: none`. Keep existing overflow / tap-highlight rules.
2. Add a matching opt-in block: `user-select: text`, `-webkit-user-select: text`, `-webkit-touch-callout: default` for `input`, `textarea`, `[contenteditable]`, `.lyrics-plain`.
3. Leave the existing `.row` / `.media-card` / `.lyrics-line` `user-select: none` rules in place.
4. `copyText(value: string): Promise<boolean>` — if `value` is empty, return `false` and do not toast. Else `navigator.clipboard.writeText`, toast “Copied”, return `true`; on throw toast “Could not copy”, return `false`.
5. `copyDiagId` becomes a thin wrap: no value → return; else `await copyText(value)`.
6. Unit-test `copyText` with a mocked `navigator.clipboard.writeText` (resolve and reject) and a mocked `showToast`. Empty string writes nothing.

### Verify

```sh
pnpm --dir frontend typecheck
pnpm --dir frontend test
```

Manually (not automated): search field still accepts select-all and caret selection; dialog prompt still selects on open; Settings Copy still toasts; drag on a view title, now-playing title, and a settings hint does not highlight; `.lyrics-plain` (unsynced track) still highlights.

## Acceptance

- [x] App chrome is not selectable; the four opt-in targets are.
- [x] Settings diagnostic copy uses `copyText` and the same two toasts.
- [x] `copyText` has node tests for success, failure, and empty input.
