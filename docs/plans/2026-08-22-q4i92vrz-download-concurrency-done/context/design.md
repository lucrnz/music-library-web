**Archive.** Decisions in this file were current as of 2026-08-22 (the plan date in the directory name). They may be outdated. Do not treat this as living documentation. This plan directory is an archive.

# Client concurrent-download setting

## Goal

Let the user pick how many download-manager jobs run at once, persist that choice on the device, and make the queue pump honor it immediately — including demoting extras back to the queue (partial kept) when the cap shrinks.

## Settled decisions

- Client-only. No server config, no IDB meta row. Persist in `localStorage` next to the downloads enable flag.
- Allowed values: `1`, `2`, `4`, `6`, `8`, `10`, `12`. Default `2`. Invalid or missing stored values load as `2`.
- Labels: `1` is **Sequential (1)**; the rest are the numeral. Field label is **Concurrent downloads**.
- Picker lives only in Settings → Downloads, visible when downloads are enabled. The download manager stays queue operations (pause / resume / cancel).
- Raising the cap fills empty slots immediately via the existing pump, unless the queue is user-paused or auto-paused.
- Lowering the cap keeps the N in-flight jobs with the most bytes already written (live progress, then the IDB `loaded` field). Tie-break: earlier `addedAt`, then lower queue `id`.
- Extra in-flight jobs are not user-cancelled (that discards the partial) and are not globally paused (that waits for Resume all). Abort the HTTP write, keep the OPFS partial and byte progress, and return the row to `pending` so it resumes when a slot opens.
- Global user-pause and auto-pause still freeze every active job. Changing the cap while paused only persists; the pump stays idle until resume.

## Design

Today `queueRuntime.ts` hardcodes `MAX_CONCURRENT = 2`. Jobs already resume from OPFS partials with `Range` and `keepPartialOnAbort`. The missing piece is a persisted cap plus an abort path that requeues instead of marking `paused` or discarding.

```text
Settings → Downloads
  Concurrent downloads  [ Sequential (1) | 2 | 4 | … | 12 ]
        │
        ▼
localStorage  musicweb.downloadConcurrency
downloads.concurrency          (reactive)
        │
        ▼
setDownloadConcurrency
  persist + state
  applyConcurrency             (runtime)
        │
        ├─ activeIds.size > cap
        │     rank by loaded desc, addedAt, id
        │     abort extras with reason "demote"
        │     queued outcome → pending, keep partial
        └─ schedulePump
              while activeIds.size < cap && canPump
                next pending (addedAt order)
```

Ownership stays inside `frontend/src/downloads/`:

| Piece | Module |
|---|---|
| Allowed values, parse/load/save, rank-to-keep | new `concurrency.ts` (pure) |
| Reactive `downloads.concurrency` | `state.ts` |
| Public setter / hydrate on init | `index.ts` |
| Pump cap + demote | `queueRuntime.ts` |
| Abort reason → `queued` outcome | `worker.ts` |
| Settings picker | `SettingsModal.vue` via existing `SettingsSelect` |

`settings.ts` stays quality prefs (stream / download codec / playback policy). This is an operational downloads pref, same family as `musicweb.downloadsEnabled`.

`queue.ts` does not import runtime. Demote must not go through `cancelQueueItem` (discards) or `freezeActive` / `pauseQueuedWork` (marks every active+pending row `paused`). The worker already has three abort sites that call `resolveAbortKind` (`canceled` vs `paused`). Those sites gain a check for abort reason `demote` and return a new outcome kind `queued`: `markPending`, keep `loaded` / `total`, do not unlink the partial. A `CANCELED` row still wins that race.

`applyConcurrency` ranks current `activeIds` only. It aborts extras and drops them from `activeIds` so the cap is respected immediately. It does **not** flip IDB to `pending` itself — the dying job is still `active` until the `queued` handler runs, so the pump cannot restart the same id. `schedulePump` then fills only if the new cap is higher (or a keeper finished).

Hydrate the stored cap on `initDownloads` even when the feature is off, so enabling later sees the last choice. The picker is hidden while disabled.

## Stage map

1. **Persist + model** — UI and the pump both need one allowed-value list, a load/save path, and a pure rank-to-keep helper. Nothing user-facing or in-flight changes yet.
2. **Pump + demote** — depends on that cap and ranking. This is the behavior change; a picker that does not move the pump would be a lie.
3. **Settings picker** — depends on the public setter and reactive field. Last product surface; manager is left alone.
4. **Living docs** — written against the contract stages 01–03 actually ship, in `docs/systems/downloads.md` and the frontend conventions pointer.

## Out of scope

- Server-side or household-wide concurrency
- A picker (or per-row pause) on the download manager
- Individual user-pause of a single job, other than this demote path
- Changing the historical default of 2 except via this picker
- Device- or network-based caps (12 is always offered)
- Cross-tab live sync of the pref
- New Vue/OPFS/worker integration tests (see `docs/development/testing.md`)

## Assumptions

- `AbortController.abort(reason)` is available on the browsers this PWA targets; demote uses `reason === "demote"`.
- Existing Range + `keepPartialOnAbort` is enough to resume a demoted job; no worker I/O rewrite.
- `SettingsSelect` option ids are strings (`"1"`, `"2"`, …); the setter parses them.
- A missing `total` does not affect ranking (bytes written only).
- Persist failures (quota / private mode) are ignored, same as other client prefs.
