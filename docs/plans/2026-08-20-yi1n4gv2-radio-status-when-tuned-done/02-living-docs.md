# Stage 02: Record the tuned codec-line gate

## Status
done

## Description

Update living radio and playback docs so the codec line is described as tuned-only, with a reserved empty wrap on the room when it is hidden.

## Rationale

[design.md](context/design.md) is not living documentation. The shipped rule belongs next to the existing client chrome notes, or the next radio change will re-introduce an always-on badge.

## Invariants

- Do not add an ADR. This is a chrome rule, not a new architecture decision.
- Do not rewrite the earlier radio-player plan archive.

## Risks

None

## Implementation

### Files

- `docs/systems/radio.md`
- `docs/systems/playback.md`

### Steps

1. In `radio.md` **Client**, replace the sentence that the codec line is injected `PlaybackStatusLine` with: the room injects `PlaybackStatusLine` only while chrome is `tuned` (`playSource: "streaming"` + tuner profile, or lossy source fields; exclusive snap disabled). When chrome is not `tuned`, the room keeps an empty `.np-status-wrap` so extras do not jump. Compact and mini still have no codec line.
2. In `playback.md`, where radio now-playing is said to reuse injected `PlaybackStatusLine`, add that on `/radio` the line mounts only while tuned and the status wrap stays reserved.

### Verify

- Those two sentences match stage 01 behavior (tuned-only badge, reserved empty wrap, compact/mini unchanged).
- No leftover “always injected” wording for the radio room codec line.

## Acceptance

- An operator reading `radio.md` and `playback.md` learns the badge is tuned-only and that the room reserves the slot.
- Archive plans under `docs/plans/` are untouched.
