# Stage 06: Offline pending queue

## Status
done

## Description

When crop finishes and the server is not reachable, keep the cropped blob on this device, show it immediately on list/grid/tree thumbs via the stage 05 overlay, and POST (or DELETE, for revert) when connectivity returns. One pending record per artist. Recrop replaces. Revert cancels a pending upload and can queue a revert for a live override. A queued revert **keeps the preferred thumb** until DELETE succeeds. HTTP 200 still goes through stage 05’s `applyPreferredServerResult` (overlay + live `urlCache` blob URL). Boot is `initArtistArtPending()` from `main.ts`. Flush re-arms with `reportFailure` + `requestHealthProbe`, not “wait for recovered.” `submit.ts` is the only enqueue wrap; `pending.ts` does not import `submitPreferred*`.

## Rationale

The operator chose queue-over-disable. Stage 05’s `applyPreferredServerResult` is the flush target; this stage only adds `previewUrl` / `pending` / IDB, boots from `main.ts`, re-arms the existing health loop on enqueue and flush failure, and makes every connectivity health gate OR `setHealthWork` sources so `server_down` recovers when the download queue is empty. Enqueue lives in `submit.ts` wrapping the stage-05 submit helpers. `pending.ts` imports HTTP/apply from `upload.ts` only. Do not re-implement overlay writes through the raw POST/DELETE helpers. Do not make GET look scanned while preferred files still exist.

## Invariants

- At most one pending record per `artistId`. A new crop replaces the blob (revoke the old `previewUrl`) and resets the action to upload. A revert while only a pending upload exists deletes the record and does not DELETE the server.
- A revert while the server already has an override and the client is offline stores `{ action: "revert" }` (no blob). Flush calls DELETE.
- **Synced override + pending upload + revert → one revert record, no blob.** Drop the queued crop, revoke its object URL, store `{ action: "revert" }`.
- Pending lives in IndexedDB database `musicweb-artist-art`, store `pending`, key `artistId`. Do not open `musicweb-downloads` or `musicweb-diag`.
- Flush calls `applyPreferredServerResult(id, artistDict)` after HTTP 200, **then** deletes the IDB row. It does not write the overlay itself and does not mutate list rows or `TreeNode.cover`. `pending.ts` writes the overlay only for enqueue / boot restore (`previewUrl` / `pending`).
- Enqueue when `!canReachServer()` **or** when `classifyError(err, status)` is `offline` / `server_down`. `item_fail` (including 413 / 400), `abort`, and `unknown` toast and do not enqueue.
- `initArtistArtPending()` is called from `frontend/src/main.ts` next to `initDownloads()`. It must not rely on `LibraryView` / `artistMenuItems` import order.
- Re-arm: whenever a pending row is created, or flush fails with `offline` / `server_down` / network, call `reportFailure` (unless already hard-offline), `setHealthWork("artist-art", true)`, and `requestHealthProbe(0)` if not hard-offline. Do not describe retry as “wait for `onConnectivityRecovered`.”
- One in-flight flush at a time. Subscribe to `onConnectivityRecovered` **and** `onConnectivityChange` when the new state is `online`.
- Enqueue revert sets `{ pending: "revert", previewUrl: undefined, hasPreferred: <unchanged>, preferredRev: <overlay’s last preferredRev> }` and revokes any preview object URL. Persist that `preferredRev` on the IDB record. Never invent `preferredRev: 0`. `menuHasPreferred` is false because `pending === "revert"`. The thumb stays preferred until flush DELETE + `applyPreferredServerResult`.
- `healthEnabled` and `healthQueueHasWork` are deleted. `setHealthWork(source: "downloads" | "artist-art", hasWork)` is the only write. `needsHealthProbe`, `syncHealthLoop`, `runHealthProbe`, `requestHealthProbe`, and the window `online` handler all OR the map (and still refuse hard-offline). `setHealthContext` stays the downloads call shape and writes only `"downloads"`. No second health loop. No free-form source strings.
- Tests cover the reducer/policy and health-work OR semantics including `requestHealthProbe` with downloads idle. They do not open IndexedDB or OPFS.

## Risks

- Two tabs on one origin can flush the same pending twice. Last write wins on the server; delete the IDB row only after HTTP 200.
- Writing the overlay in both `upload.ts` and `pending.ts` after HTTP will drift (online POST refreshes OPFS; flush does; revert paths disagree). Flush must call `applyPreferredServerResult`.
- Treating `overlay.pending` as a boolean keeps “Use library photo” after a queued revert. Forcing `hasPreferred=false` does **not** change GET bytes (preferred files still exist) and the same `rev` is the same cached URL.
- Leaving any of the five health gates on the old boolean pair means `requestHealthProbe(0)` no-ops when the download queue is empty.
- “Wait for the next recovery” while state is still published `online` never fires `onConnectivityRecovered`. A failed in-flight POST must `reportFailure` + `requestHealthProbe`.
- Boot via a Vue host import does not run when `App.vue` shows the Downloads tab (`v-if="onDownloads"` unmounts `LibraryView`).

## Implementation

### Files

- Create: `frontend/src/artistArt/pendingPolicy.ts` (pure: apply enqueue/replace/revert; records to flush)
- Create: `frontend/src/artistArt/pending.ts` (`initArtistArtPending`, `enqueuePreferred`, IndexedDB `musicweb-artist-art`, single-flight flush, `rearmArtistArtHealth` helper). Imports apply/HTTP from `upload.ts` only. **Does not** import `submitPreferred*` / `submit.ts`.
- Change: `frontend/src/main.ts` — `initArtistArtPending()` next to `initDownloads()`. Do not boot from `LibraryView` / `App.vue` / a side-effect import.
- Create: `frontend/tests/artistArt/pendingPolicy.test.ts`
- Create: `frontend/tests/connectivity/healthWork.test.ts` — two sources OR; `setHealthContext({ enabled: false, queueHasWork: false })` does not clear artist-art work; `requestHealthProbe` actually schedules when only `"artist-art"` has work
- Create: `frontend/tests/artistArt/rearm.test.ts` — `rearmArtistArtHealth` calls `reportFailure` + `setHealthWork("artist-art", true)` + `requestHealthProbe(0)` when not hard-offline; skipped when hard-offline
- Change: `frontend/tests/artistArt/state.test.ts` (from stage 05) — pending-revert display: `coverSrc` stays the preferred URL (`hasPreferred` still true, last `preferredRev`); `menuHasPreferred` is false
- Change: `frontend/src/artistArt/state.ts` (stage 06 writes `previewUrl` + `pending` on the same map; `coverSrc` already prefers `previewUrl`)
- Change: `frontend/src/connectivity.ts` (delete the two booleans; `setHealthWork`; every gate ORs the map)
- Do not change: `frontend/src/downloads/queuePolicy.ts` (`setHealthContext` keeps its current call shape)
- Change: `frontend/src/artistArt/submit.ts` so `submitPreferredCrop` / `submitPreferredRevert` enqueue via `enqueuePreferred` when `!canReachServer()` **or** when `classifyError(err, err.status)` is `offline` / `server_down`. `item_fail` / `abort` / `unknown` toast and do not enqueue. Success still goes through `applyPreferredServerResult` only. This is the only wrap site. Do not move enqueue into `upload.ts`.
- Do not re-implement `refreshArtistArtFile` (stage 05). Flush must not call it except via `applyPreferredServerResult`.
- Change: `frontend/src/components/library/artistMenuItems.ts` only if `menuHasPreferred` is not already used (it should be from stage 05)
- Do not create: a second preview map or `coverSrc.ts`

### Steps

1. Record shape: `{ artistId, action: "upload" | "revert", blob?: Blob, name, queuedAt, preferredRev?: number }`. Persist `preferredRev` from the overlay at enqueue so boot restore does not write `preferredRev: 0` (that would override the list’s rev via `??`). A persisted revert always means a live server override, so boot sets `hasPreferred: true`.
2. Policy tests: upload then upload → one upload, latest blob; upload then upload-never-synced revert → empty; synced override + offline revert → one revert; revert then upload → one upload; **synced override + pending upload + revert → one revert record, no blob**.
3. IDB: database name `musicweb-artist-art`, object store `pending`, keyPath `artistId`. Thin wrapper.
4. Shared `rearmArtistArtHealth()`: unless hard-offline, `reportFailure()`, `setHealthWork("artist-art", true)`, `requestHealthProbe(0)`. Call it whenever a pending row is created **and** when flush fails as `offline` / `server_down` / network. Recrop while queued replaces the blob and the preview URL (revoke the old one) and calls `rearmArtistArtHealth` again.
5. On enqueue upload: set overlay `{ previewUrl, pending: "upload" }` (keep last known `hasPreferred` / `preferredRev`; revoke any previous preview object URL), toast that the photo will upload when the server is back, persist IDB, `rearmArtistArtHealth()`.
6. On enqueue revert: set overlay `{ pending: "revert", previewUrl: undefined, hasPreferred: <unchanged>, preferredRev: <overlay’s last preferredRev> }`, revoke any preview object URL, toast that the library photo will return when the server is back (if a remote override still exists), persist IDB (include `preferredRev`), `rearmArtistArtHealth()`. Do not flip `hasPreferred`. Never write `preferredRev: 0` as a fallback. GET still serves preferred files.
7. Delete `healthEnabled` / `healthQueueHasWork`. `setHealthWork("downloads" | "artist-art", hasWork)` updates the map. Every function that used the pair ORs `hasHealthWork()` (any source true) and still refuses hard-offline. `setHealthContext({ enabled, queueHasWork })` → `setHealthWork("downloads", !!(enabled && queueHasWork))`.
8. Single-flight `flushPending()`: if a flush is already in flight, join it (do not POST the same blob twice). FIFO by `queuedAt` through the stage-05 POST/DELETE helpers. Success: `applyPreferredServerResult(id, dict)`, then delete the IDB row. Failure classified `offline` / `server_down`: keep IDB + overlay preview, toast, `rearmArtistArtHealth()`, stop the rest of this flight. `item_fail` / `abort` / `unknown`: toast, leave the row, do not enqueue a duplicate, do not flip connectivity. When no pending rows remain, `setHealthWork("artist-art", false)`. Subscribe to `onConnectivityRecovered` **and** `onConnectivityChange` when `next === "online"`; both call `flushPending`. Do not write “wait for the next recovery.”
9. `initArtistArtPending()` (exported from `pending.ts`, called from `main.ts` next to `initDownloads()`): read IDB; restore overlay `previewUrl` / `pending` for pending uploads (keep stored `preferredRev`); for pending reverts restore `{ pending: "revert", hasPreferred: true, preferredRev: record.preferredRev }` with no preview; `setHealthWork("artist-art", hasRows)`; if already `online` and not hard-offline, `flushPending()`. Must run when the session opens on the Downloads tab.
10. Do not re-implement `refreshArtistArtFile`. Flush reaches it only via `applyPreferredServerResult`. A flush while the Downloads pane is mounted must update thumbs through the stage-05 Vue-readable `urlCache`.

### Verify

```sh
pnpm --dir frontend typecheck
pnpm --dir frontend test
```

Manually: load `/artists`, stop the server or switch to `server_down`, Change photo → crop → Use → thumb updates (preview URL) and a queued toast; start the server **without** a download queue → overlay switches to the new `preferred_rev` (not an unbusted scanned URL) and an uploaded toast (`requestHealthProbe` must have run); DevTools Application shows `musicweb-artist-art` row gone. Repeat for revert: thumb **stays preferred** until flush, “Use library photo” is gone, toast says the library photo returns when the server is back; after flush the URL has the bumped `&rev=` and the scanned/placeholder thumb. Recrop while queued replaces the preview (old object URL revoked). Reload the PWA on the Downloads tab with a pending row: overlay/health work restore and flush without visiting `/artists`. With that artist pinned and Downloads visible, flush replaces the thumb (new `urlCache` blob URL, not a broken/revoked image). Confirm a downloads-only `server_down` recovery still works. Kill the server mid-POST (classify `server_down` while the banner still says online) and confirm the crop enqueues and a later probe flushes it.

## Acceptance

- [ ] Policy tests cover replace, cancel-pending, queued revert, revert-then-upload, and **synced override + pending upload + revert → one revert, no blob**.
- [ ] State tests: pending revert keeps the preferred thumb (`hasPreferred` unchanged, last `preferredRev`) and hides “Use library photo” (`pending === "revert"` is not `menuHasPreferred`).
- [ ] Connectivity tests: `setHealthWork("artist-art", true)` then `setHealthContext({ enabled: false, queueHasWork: false })` still lets `requestHealthProbe` schedule; `needsHealthProbe` / `syncHealthLoop` / `runHealthProbe` / window `online` all OR the map. `rearmArtistArtHealth` tests lock `reportFailure` + probe when not hard-offline.
- [ ] Offline crop is visible on this device immediately (overlay `previewUrl`) and POSTs once when the server returns, including `server_down` with an empty download queue **and** a POST that fails as `server_down` after crop while published `online`. After flush, thumbs use the new `preferred_rev`, not the pre-crop URL.
- [ ] `main.ts` calls `initArtistArtPending()`. Boot on the Downloads tab restores overlay + health work and can flush.
- [ ] Flush is single-flight. Failure `offline` / `server_down` calls `rearmArtistArtHealth` (`reportFailure` + `setHealthWork` + `requestHealthProbe`). Retry is not “wait for recovered.”
- [ ] Flush does not mutate list rows or `TreeNode.cover`. Flush does not write the overlay except by calling `applyPreferredServerResult`.
- [ ] Failed flush leaves the pending record and the preview.
- [ ] Online submit *and* flush refresh OPFS via `applyPreferredServerResult`; a mounted Downloads view reads the new `urlCache` blob URL. `ensureArtistArtFile` is unchanged.
- [ ] IDB name is `musicweb-artist-art`. Downloads and diag databases are untouched.
- [ ] No pending-photos settings screen. No second preview map. No `pending.ts` → `submit.ts` import.
