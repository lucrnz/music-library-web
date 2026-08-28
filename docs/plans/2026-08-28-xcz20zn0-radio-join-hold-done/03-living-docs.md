# Stage 03: Living docs

## Status
done

## Description

Rewrite the client radio join contract so living docs match stages 01–02: `tuned` after `play()`, an 8 s playback hold before pause means Tune-out, and a failed hold stays in session and retries. Do not treat `context/design.md` as living documentation.

## Rationale

`docs/systems/radio.md` still says chrome stays `tuning` until load → seek → play succeeds and that HTML/Media Session `pause` Tunes out whenever chrome is `tuned`. After 01–02 that pause sentence is wrong for the first 8 s.

## Invariants

- Living docs describe shipped client behavior only. No server protocol change, no new chrome value, no pauseable radio after the hold, no rejoin toasts.
- Source of truth for the 8000 ms constant stays `frontend/src/radio/hold.ts`.
- No ADR. The hold contract lives in `docs/systems/radio.md`.

## Risks

- Leaving “pause while `tuned` Tunes out” unqualified in a system doc outside `docs/plans/`.

## Implementation

### Files

- `docs/systems/radio.md`
- `docs/systems/playback.md`

### Steps

1. In `docs/systems/radio.md` **Client**, next to the existing rejoin-clock owner sentence, name the hold module as the 8 s join-hold clock. After the sentence that chrome stays `tuning` until load → seek → play succeeds, state: chrome becomes `tuned` on that `play()`; an 8 s hold then runs; HTML and Media Session `pause` during the hold stay in session (`tuning` + the existing 1 s → 8 s `schedule`), they Tune out only after the hold completes (element not `ended`; load/seek in flight still ignored); official `ended` during the hold cancels the hold and does not retry that load; Media Session **stop** and the Tune-out tap still leave immediately; listen cycles still start after the successful `play()`, not after the hold.
2. In `docs/systems/radio.md` **Guardrails**, extend the stay-in-session bullet: do not Tune out on a `pause` or `error` while the join hold is pending; do not treat `play()` success as the end of the join.
3. In `docs/systems/playback.md` household-radio paragraph, after “A failed join stays `tuning` and retries”, add that a join that plays then stops in the first 8 s is that same failed join (not a Tune-out). Keep listen-cycle discard language as it is (Tune out / leave / catch-up / skip-pending / a new `loadCurrent`). Point at `docs/systems/radio.md`.
4. Grep `docs/` excluding `docs/plans/` for leftover unqualified “pause while `tuned`” / “stays `tuning` until `play()` succeeds” that would contradict the hold.

### Verify

```sh
rg -n "pause while|until load → seek → play|until play succeeds" docs --glob '!docs/plans/**'
```

Read the edited **Client** / **Guardrails** paragraphs and the playback radio paragraph and confirm they match stages 01–02 (`tuned` on `play()`, 8 s hold, pause-during-hold retries, ended-during-hold is success, Tune-out tap still immediate). No frontend test run required unless a later edit accidentally touched source.

## Acceptance

- `docs/systems/radio.md` states the 8 s join hold and the pause-during-hold retry. `docs/systems/playback.md` does not contradict it.
- Archived plans under `docs/plans/` may still describe pause-while-`tuned` without a hold; do not rewrite them.
- No ADR file.
