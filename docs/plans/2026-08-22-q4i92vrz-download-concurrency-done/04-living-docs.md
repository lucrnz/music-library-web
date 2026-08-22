# Stage 04: Living docs for the concurrency cap

## Status
done

## Description

Record the client-only concurrent-download cap, its Settings surface, persist key, and demote-to-pending rule in the downloads system page and the frontend conventions pointer.

## Rationale

`docs/systems/downloads.md` is the ownership map for the queue pump. After stages 01–03 the hardcoded “2 at a time” story is wrong; later work will reintroduce a constant unless the living page says the cap is a client pref.

## Invariants

- Living docs describe intent and ownership. Exact allowed values may be listed once; do not duplicate pump/abort argv-level detail that belongs in `queueRuntime.ts` / `worker.ts`.
- Do not treat `context/design.md` as living documentation.
- Do not add a server/env knob or imply the cap is household-wide.

## Risks

- Documenting the abort-reason string or outcome-kind table will drift. Say “abort extras, keep the partial, return the row to pending.”

## Implementation

### Files

- `docs/systems/downloads.md`
- `docs/frontend/conventions.md`

### Steps

1. In `docs/systems/downloads.md`, in the source-of-truth / settings bullets, note that concurrent-job count is a client pref (`musicweb.downloadConcurrency`, default 2, allowed 1/2/4/6/8/10/12) owned next to the enable flag, not `stores/settings.ts`. In Behavior / Queue, replace any implication of a fixed pair of workers: the pump admits up to that cap; lowering it keeps the in-flight jobs with the most bytes written and requeues the rest as `pending` with partials kept. Point at `concurrency.ts` + `queueRuntime.ts` in the ownership table.
2. In `docs/frontend/conventions.md`, where Settings-vs-downloads ownership is listed, add that the concurrent-downloads picker is Settings chrome bound to `downloads.concurrency` / `setDownloadConcurrency`, not a quality field on `settings.ts`.

### Verify

Read both pages against [context/design.md](context/design.md): client-only, default 2, Settings → Downloads only, demote-to-pending with partial kept, manager has no picker. Confirm no second copy of the rank tie-break algorithm beyond a short “most bytes written.”

## Acceptance

- A reader of `docs/systems/downloads.md` knows the cap is a persisted client pref and what happens when it shrinks.
- A reader of `docs/frontend/conventions.md` knows the picker is Settings chrome over downloads state, not `settings.ts`.
- Neither page lists `DEMOTE_ABORT_REASON` or the `queued` outcome kind as a public contract.
