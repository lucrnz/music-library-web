# Stage 04: Downloads boot does not persist-disable

## Status
done

## Description

A failed `initDownloads` / `bootDownloadsRuntime` must not write `musicweb.downloadsEnabled=false`. Only explicit user disable persists off.

## Rationale

Today any OPFS/IDB/worker throw persist-disables the feature, so the next launch never opens the catalog even after the transient error is gone. That is an offline play blocker the user did not choose.

## Invariants

- `enableDownloads` failure may still revert in-memory enable and persist off (user just tried to turn it on and it failed — do not leave a lying `true` flag).
- `disableDownloads` still persist-writes off.
- `initDownloads` catch: set `downloads.error`, `downloads.ready = true`, do **not** call `saveEnabledFlag(false)`.
- This-session `downloads.enabled`: keep the stored user intent (`true`) so the Downloads tab stays visible; catalog/queue APIs that hit a closed DB already fail per call. Do not `resumeQueue` (boot already aborted before that, or guard if the catch is later).

## Risks

- A half-open IDB with `enabled === true` could let the Downloads tab render empty plus `downloads.error`. Prefer that over hiding the feature and forgetting the flag.
- If something in the queue policy starts workers solely because `enabled` is true, guard: `initDownloads` must not call `resumeQueue` / `bindQueueListener` on the failure path (today they are inside `bootDownloadsRuntime` before the catch).

## Implementation

### Files

- Change `src/musicweb/static/js/downloads/index.js`

### Steps

1. In `initDownloads` `catch`: delete `saveEnabledFlag(false)`. Keep `console.error` and `downloads.error`. Set `downloads.enabled` from `loadEnabledFlag()` (already `true` if we entered `bootDownloadsRuntime`) — do not force `false`. `downloads.ready = true`. `syncControlFlags()` as today.
2. Leave `enableDownloads` `catch` as persist-off (explicit enable failed).
3. Confirm no other boot path calls `saveEnabledFlag(false)` except user disable / failed enable.

### Verify

- `rg "saveEnabledFlag\\(false\\)" src/musicweb/static/js/downloads/index.js` — only `enableDownloads` catch and `disableDownloads` (or equivalent explicit off).
- Manual: with downloads already enabled, force a boot throw if practical (or inspect the catch). `localStorage.musicweb.downloadsEnabled` stays `"1"`. Reload after restoring OPFS still hydrates the catalog.
- Manual, Settings → disable downloads: flag still clears.

## Acceptance

- [ ] Cold-start boot failure does not persist downloads off.
- [ ] Explicit disable and failed enable still persist off.
- [ ] Downloads tab remains available when the stored flag is on, even if this session’s boot set `downloads.error`.
