# Stage 03: Living docs

## Status
done

## Description

Rewrite the client radio contract so living docs match stages 01–02: who may Tune out, chrome drops to `tuning` on a swap, stubborn rejoin, silent retryable failures, and the deleted failure cap. Do not treat `context/design.md` as living documentation.

## Rationale

`docs/systems/radio.md` still describes pause-while-ended as the only pause latch and says nothing about staying in session or retrying a join. After 01–02 those sentences are incomplete and will block the next change.

## Invariants

- Living docs describe shipped client behavior only. No server protocol change, no exclusive radio, no idle auto Tune-in, no rejoin toasts.
- Source of truth for request shapes, encoder argv, and exact backoff constants stays the code (`frontend/src/radio/rejoin.ts`, `frontend/src/radio/audio.ts`).
- No ADR. The stay-in-session contract lives in `docs/systems/radio.md`.

## Risks

- Leaving “3 in 10s” / “tuned out” failure-cap language in a system doc outside `docs/plans/`.

## Implementation

### Files

- `docs/systems/radio.md`
- `docs/systems/playback.md`

### Steps

1. In `docs/systems/radio.md` **Client**, after the existing pause/`ended` sentence, state: chrome becomes `tuning` as soon as the official current id (or delivery) must reload, and stays `tuning` until load → seek → play succeeds; HTML/Media Session `pause` Tunes out only while chrome is `tuned` and the element has not ended (load/seek in flight still ignored); Media Session `stop` Tunes out; station idle Tunes out; load/play/socket/`tune_in`/connectivity failures do **not** Tune out — they stay `tuning` and retry (`sendTuneIn` when the socket is open, then `loadCurrent`) on a 1 s backoff doubling to 8 s, with an immediate kick on a new current snapshot, reconnect, and connectivity `online`; radio `load` waits at most 8 s for `canplay`; retryable failures are silent. Name the new rejoin module next to the existing session and runtime owners.
2. In `docs/systems/radio.md` **Guardrails**, add: do not Tune out on official advance, skip-pending, catch-up, load/play error, or connectivity loss; do not call `tuneOut()` from the rejoin clock; do not resurrect a failure-cap Tune-out. Keep the existing live-getter and no-`player.ts` bullets.
3. In `docs/systems/playback.md`, in the household-radio paragraph, replace any implication that a failed tune leaves the session. State that a failed join stays `tuning` and retries, and that listen cycles still discard on Tune out / leave / catch-up / skip-pending / a new `loadCurrent` (including a retry). Point at `docs/systems/radio.md`.
4. Grep `docs/` excluding `docs/plans/` for leftover “3 in 10s”, “Radio could not start”, “Connection lost — tuned out”, and `createFailureCap`.

### Verify

```sh
rg -n "3 in 10s|Radio could not start|Connection lost — tuned out|createFailureCap" docs --glob '!docs/plans/**'
```

Read the edited **Client** / **Guardrails** paragraphs and the playback radio paragraph and confirm they match stages 01–02 (allowed Tune-outs, `tuning` until play, 1 s–8 s backoff, 8 s load bound, silent retries). No frontend test run required unless a later edit accidentally touched source.

## Acceptance

- `docs/systems/radio.md` states the stay-in-session contract and the rejoin loop. `docs/systems/playback.md` does not contradict it.
- Archived plans under `docs/plans/` may still describe the failure cap; do not rewrite them.
- No ADR file.
