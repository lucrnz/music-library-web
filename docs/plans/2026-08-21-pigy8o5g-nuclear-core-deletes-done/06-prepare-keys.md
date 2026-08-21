# Stage 06: Prepare keys out of api.ts

## Status
done

## Description

Move `preparedKeys`, `requestPrepare`, and `requestForget` from `api.ts` into `playback/prepare.ts`. HTTP helpers stay in `api.ts`.

## Rationale

Prepare bookkeeping is playback, not HTTP. `api.ts` owning a global `Set` is the layer leak the next prepare tweak will extend.

## Invariants

- Forget is still fire-and-forget `POST /api/transcode/forget` in 1000-id chunks. Matching `id|` prefixes still drop from `preparedKeys`.
- Non-urgent prepare still skips ids already in `preparedKeys` unless `replace`. Urgent still always POSTs.
- Saved-playlist load still does not forget.
- `prepareTracks` remains the only grouping path (exclusive-by-tag, download skip).

## Risks

- Test mocks still patch `@/api`. Update mocks to `@/playback/prepare` or tests will call the real fetch.

## Implementation

### Files

- `frontend/src/playback/prepare.ts`
- `frontend/src/api.ts`
- `frontend/src/stores/settings.ts`
- `frontend/src/stores/playlist.ts`
- `frontend/tests/api/forget.test.ts`
- `frontend/tests/playback/prepare.test.ts`
- `frontend/tests/stores/settings.test.ts`
- `frontend/tests/stores/playlist.test.ts`
- `frontend/tests/stores/playerPrefs.test.ts`
- `frontend/tests/stores/radio.test.ts`
- `frontend/tests/downloads/queuePolicy.test.ts`

### Steps

1. Move `preparedKeys`, `requestForget`, and `requestPrepare` from `frontend/src/api.ts` to `frontend/src/playback/prepare.ts`. They may call `apiPost` / `apiFetch` from `api.ts`. Delete them from `api.ts` (no re-export).
2. Point `frontend/src/stores/settings.ts` and `frontend/src/stores/playlist.ts` at `playback/prepare.ts` for those three names. `prepareTracks` in the same file already owns grouping — `requestPrepare` calls stay there.
3. Move `frontend/tests/api/forget.test.ts` to import `preparedKeys` / `requestForget` from `@/playback/prepare`. Update `frontend/tests/playback/prepare.test.ts` so its `requestPrepare` mock is `@/playback/prepare` (or spy the moved function without a self-mock — do not mock the module under test if that breaks). Point settings/playlist/playerPrefs/queuePolicy mocks at `@/playback/prepare` instead of `@/api` for these names. Drop stale `@/api` prepare mocks. `frontend/tests/stores/radio.test.ts` comments that mention `requestPrepare` on settings may stay if they do not import `api.ts` for it.

### Verify

- `pnpm --dir frontend test -- frontend/tests/api/forget.test.ts frontend/tests/playback/prepare.test.ts frontend/tests/stores/settings.test.ts frontend/tests/stores/playlist.test.ts frontend/tests/stores/playerPrefs.test.ts frontend/tests/downloads/queuePolicy.test.ts`
- `pnpm --dir frontend typecheck`
- `rg -n "preparedKeys|requestPrepare|requestForget" frontend/src/api.ts` is empty

## Acceptance

- `api.ts` has no prepare/forget bookkeeping.
- `playback/prepare.ts` owns `preparedKeys`, `requestPrepare`, and `requestForget`.
- Tests mock or import the new owner. Forget and prepare skip/urgent behavior is unchanged.
