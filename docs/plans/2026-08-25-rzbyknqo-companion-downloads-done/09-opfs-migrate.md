# Stage 09: Migrate leftover OPFS on desktop PWA

## Status
done

## Description

On installed desktop PWA boot, if OPFS catalog files exist, ask Yes / Later. Yes PUTs them to the companion and wipes OPFS. Later snoozes until next boot; leftover still plays in HTML; a toast and any new download reopen the dialog.

## Rationale

Desktop PWA must not keep an OPFS locker. Play and PUT already exist (stages 05–08), so Yes can be real.

## Invariants

- Prompt only when `canUseCompanionDownloads()` and at least one OPFS audio or art file exists for a catalog row.
- Yes: blocking progress on `downloads.migrate`; cancel leaves OPFS intact and deletes companion keys written in this attempt.
- Later: no persist “never ask”; next `initDownloads` asks again. Toast copy can be temporary; tap calls the same dialog.
- New `downloadTrack(s)` / enable-already-on enqueue while leftovers exist reopens the dialog with “needed for downloads” copy and does not enqueue until Yes completes.
- After a successful Yes, OPFS download dirs are empty (`wipeOpfsDownloads`) and new jobs use the companion backend only.

## Risks

- Multi-GB PUT on the main thread will hitch. Stream each file with `file.stream()` to `fetch(PUT)`.
- Companion must be connected before Yes; if not, say so and keep Later semantics.

## Implementation

### Files

- `frontend/src/downloads/migrate.ts`
- `frontend/src/downloads/state.ts`
- `frontend/src/downloads/index.ts`
- `frontend/src/downloads/ui.ts`
- `frontend/src/components/settings/SettingsModal.vue`
- `frontend/src/components/downloads/DownloadsModal.vue`
- `frontend/tests/downloads/migrate.test.ts`

### Steps

1. In `frontend/src/downloads/state.ts`, add `migrate: { active: boolean; done: number; total: number; error: string }`.
2. Create `frontend/src/downloads/migrate.ts`: `listOpfsLeftovers()` (catalog rows whose OPFS audio/art still exist); `migrateOpfsToCompanion({ signal })` reads each file and `putBytes`s the matching key, then `wipeOpfsDownloads` only after every PUT succeeds; on abort, `deleteKey` keys from this run. Pure `leftoverSpecsFromRecords(...)` for tests.
3. In `frontend/src/downloads/index.ts`, after a successful companion-capable `initDownloads` / `bootDownloadsRuntime`, if leftovers exist, call a prompt helper (do not persist enable-off).
4. In `frontend/src/downloads/ui.ts`, add `confirmMigrateDownloads({ required: boolean })` using existing `confirmDialog` (`confirmLabel: "Yes"`, `cancelLabel: "Later"`). `required: true` uses the “needed for downloads” message. On Yes, run migrate. On Later, `showToast` with remember-to-migrate copy (text only — toasts have no action).
5. Add a **Migrate leftover downloads** pill in `frontend/src/components/settings/SettingsModal.vue` and `frontend/src/components/downloads/DownloadsModal.vue` while leftovers exist (and while `downloads.migrate.active`), showing progress from `downloads.migrate`. The pill reopens `confirmMigrateDownloads`.
6. In `frontend/src/downloads/ui.ts` `downloadTrack` / `downloadTracks`, if leftovers exist on a companion-capable client, open the required dialog and return without enqueue until migrate succeeds.
7. Add `frontend/tests/downloads/migrate.test.ts` for `leftoverSpecsFromRecords` (ready track + album thumb → two specs; broken track audio excluded or included per “file exists” — leftover is about OPFS files, so include any spec whose record flags a file). Do not boot OPFS.

### Verify

```sh
pnpm --dir frontend test -- frontend/tests/downloads/migrate.test.ts
pnpm --dir frontend typecheck
```

## Acceptance

- Desktop PWA with leftover OPFS rows sees Yes / Later on boot. Later does not wipe OPFS. Next boot asks again.
- Yes with companion connected PUTs then clears OPFS. Cancel mid-way leaves OPFS and does not leave this-run companion partials.
- New download while leftovers remain does not enqueue until Yes finishes.
- Android never sees this dialog.
