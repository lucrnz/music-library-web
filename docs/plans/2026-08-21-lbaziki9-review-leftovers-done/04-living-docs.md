# Stage 04: Living docs

## Status
done

## Description

Patch the shipped docs so they no longer name `claimRadio` or a bag-shaped PlayIntent, and so forget’s skip is `can_encode`.

## Rationale

Stages 01–03 change documented owners. Leaving `claimRadio` in conventions/radio will recreate the alias.

## Invariants

- Source remains the source of truth for request shapes.
- No new ADR. Do not treat `context/design.md` as living documentation.

## Risks

None

## Implementation

### Files

- `docs/systems/playback.md`
- `docs/systems/transcoding.md`
- `docs/systems/radio.md`
- `docs/frontend/conventions.md`

### Steps

1. `playback.md`: PlayIntent is unavailable | ready with a required url. Exclusive notice is “block starts with exclusive.” No `prepareTag`.
2. `transcoding.md`: forget skips via `can_encode(*, is_lossy)`, not `stream_intent` + a default profile.
3. `radio.md` / `conventions.md`: Tune-in suspends Media Session (`suspendMediaSession`). Handoff names are `claimOnDemand` only on the on-demand side. Delete `claimRadio`.

### Verify

- `rg -n "claimRadio|prepareTag" docs/systems docs/frontend` is empty.
- `rg -n "can_encode" docs/systems/transcoding.md` hits.

## Acceptance

- Living docs match stages 01–03 as shipped.
- Out-of-scope items (status rewrite, catalog split, threading intents into prepare) are not promised.
