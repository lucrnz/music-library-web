# Stage 01: Persist cap and rank-to-keep

## Status
done

## Description

Add a pure downloads-owned concurrency module (allowed values, default 2, localStorage load/save, rank which in-flight jobs to keep) and hydrate `downloads.concurrency` on init. Export a persist-only setter. Do not change the pump or Settings UI yet.

## Rationale

The picker and the runtime both need one parse/persist path and one ranking function. Extracting them first keeps the later pump change thin and gives node tests something they are allowed to cover.

## Invariants

- Allowed values are exactly `1 | 2 | 4 | 6 | 8 | 10 | 12`. Default is `2`.
- `parseDownloadConcurrency` / load of a missing, empty, or unknown value returns `2`.
- `setDownloadConcurrency` returns `false` and writes nothing when the value is not in the allowed set or is already current.
- Storage key is `musicweb.downloadConcurrency`. Value is the decimal string (`"2"`, `"12"`), not JSON.
- `selectActiveToKeep` orders by `loaded` descending, then `addedAt` ascending, then `id` ascending, and returns at most `limit` ids.
- `queue.ts` still does not import runtime. `settings.ts` does not grow this pref.

## Risks

- Hydrating only inside `bootDownloadsRuntime` would leave the field at the default until the user enables downloads. Load on `initDownloads` even when the feature is off.
- Treating `setDownloadConcurrency` as a clamp (3 → 2) would hide bad callers. Reject instead; only load/parse clamps.

## Implementation

### Files

- `frontend/src/downloads/concurrency.ts`
- `frontend/src/downloads/state.ts`
- `frontend/src/downloads/index.ts`
- `frontend/tests/downloads/concurrency.test.ts`

### Steps

1. Create `frontend/src/downloads/concurrency.ts` with no Vue / queue / runtime imports. Export `DOWNLOAD_CONCURRENCY_KEY` (`musicweb.downloadConcurrency`), `DOWNLOAD_CONCURRENCY_VALUES` as the frozen allowed list, `DEFAULT_DOWNLOAD_CONCURRENCY = 2`, `isDownloadConcurrency`, `parseDownloadConcurrency` (unknown → default), `loadDownloadConcurrency` / `saveDownloadConcurrency` (try/catch like the enable flag; save writes `String(n)`), `concurrencyLabel` (`1` → `Sequential (1)`, else the numeral), `DEMOTE_ABORT_REASON = "demote"`, and `selectActiveToKeep(items, limit)` where each item is `{ id: number; loaded: number; addedAt: number }` and the return is the keeper ids (length `min(limit, items.length)`). If `limit <= 0`, return `[]`.
2. In `frontend/src/downloads/state.ts`, add `concurrency: number` to `DownloadsState` and initialize `downloads.concurrency` to `DEFAULT_DOWNLOAD_CONCURRENCY`. Import the default from `concurrency.ts`.
3. In `frontend/src/downloads/index.ts`, on `initDownloads` (both the disabled early-return path and the enabled boot path) set `downloads.concurrency = loadDownloadConcurrency()`. Export `setDownloadConcurrency(v: number): boolean` that rejects via `isDownloadConcurrency`, no-ops when equal to `downloads.concurrency`, otherwise `saveDownloadConcurrency`, assigns `downloads.concurrency`, and returns `true`. Do not call the pump yet.
4. Add `frontend/tests/downloads/concurrency.test.ts` (node vitest). Cover: parse of `"4"` / `"1"` / `null` / `"3"` / `""`; save/load round-trip through the Map-backed `localStorage` stub; `concurrencyLabel(1) === "Sequential (1)"` and `concurrencyLabel(2) === "2"`; `selectActiveToKeep` keeps the two highest `loaded` when `limit === 2`; a tie on `loaded` prefers the smaller `addedAt`; a remaining tie prefers the smaller `id`; `limit` larger than the list returns every id.

### Verify

```sh
pnpm --dir frontend test -- frontend/tests/downloads/concurrency.test.ts
pnpm --dir frontend typecheck
```

## Acceptance

- `loadDownloadConcurrency()` after `localStorage.setItem("musicweb.downloadConcurrency", "8")` returns `8`; garbage and missing keys return `2`.
- `selectActiveToKeep` matches the bytes / `addedAt` / `id` rule in [context/design.md](context/design.md).
- `downloads.concurrency` is the stored value after `initDownloads`, including when downloads stay disabled.
- `setDownloadConcurrency(4)` persists `"4"`; `setDownloadConcurrency(3)` is `false` and does not write.
- The pump still hardcodes 2. Settings has no new control.
