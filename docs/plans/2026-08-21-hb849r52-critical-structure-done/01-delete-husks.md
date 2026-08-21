# Stage 01: Delete husks

## Status
done

## Description

Remove dead compatibility names and unused catalog APIs. Drop the unused IndexedDB `blobs` store (schema v3). No behavior change.

## Rationale

Later stages retouch `catalog.ts`, `main.py`, and downloads IDB. Deleting the aliases and fossils first means those stages do not keep importing names we already know are dead.

## Invariants

- `LibraryJobRunner` remains the only library-job type. Routes use `deps.jobs`.
- Downloads enable-flag rules are unchanged. Cold-start failure still must not persist the flag off.
- OPFS remains the only binary store. Do not add a blobs fallback.
- Existing v2 catalogs must open after the v3 upgrade with tracks, queue, lyrics, and art intact.

## Risks

- `app.state.scanner` may be referenced from an operator script or old notebook outside this repo. Grep the tree; do not keep the alias “just in case.”
- IDB `onupgradeneeded` only runs when `DB_VERSION` increases. Bump to 3 and `deleteObjectStore("blobs")` when the store exists.

## Implementation

### Files

- `src/musicweb/scan/scanner.py` (delete)
- `src/musicweb/routes/deps.py`
- `src/musicweb/main.py`
- `frontend/src/downloads/catalog.ts`
- `frontend/src/downloads/db.ts`
- `frontend/src/downloads/index.ts` (only if the dynamic `import("./worker.js")` is still present)

### Steps

1. Delete `src/musicweb/scan/scanner.py`. Confirm nothing imports `musicweb.scan.scanner` or `LibraryScanner`.
2. Delete `scanner()` from `routes/deps.py`. Keep `jobs()`.
3. Delete `app.state.scanner = rt.jobs` from `main.py`.
4. In `catalog.ts`, delete `downloadStatusFor`, `getLocalAudioUrl`, and the `export { normalizeTrack }` re-export. Callers of local audio already use `getLocalAudioUrlForRecord`.
5. If `index.ts` still dynamically imports `./worker.js` while `stopAllWorkers` is a static import, delete the dynamic import and use the static binding.
6. In `db.ts`: set `DB_VERSION = 3`. In `onupgradeneeded`, if `blobs` exists, `deleteObjectStore("blobs")`. Do not create it. Remove `"blobs"` from `wipeDownloadsDb`. Rewrite the file comment to “binaries live in OPFS.”

### Verify

- `rg -n "LibraryScanner|scan\\.scanner|app\\.state\\.scanner|downloadStatusFor|getLocalAudioUrl\\(" src frontend --glob '!**/docs/**'` is empty except any remaining `getLocalAudioUrlForRecord`.
- `uv run --group dev pytest tests/test_smoke.py`
- `pnpm --dir frontend typecheck`
- `pnpm --dir frontend test`

## Acceptance

- `scanner.py`, `deps.scanner`, and `app.state.scanner` are gone.
- `downloadStatusFor`, `getLocalAudioUrl`, and the `normalizeTrack` catalog re-export are gone.
- Opening the downloads DB at version 3 does not create `blobs` and deletes it when upgrading from v2.
- Typecheck and existing tests pass with no production behavior change.
