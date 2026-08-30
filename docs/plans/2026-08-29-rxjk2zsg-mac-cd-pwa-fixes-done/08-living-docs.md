# Stage 08: Living CD docs

## Status
done

## Description

Update the durable CD / companion / playback pages so the query WAV URL, hardware key, idle watch, session toggle, mini, and identify rules are what a later agent reads. Do not copy route shapes or TOC JSON into docs.

## Rationale

`docs/systems/cd-playback.md` still describes the first implementation’s “CD button off” and poll-while-play assumptions. After stages 01–07 those sentences would be false. This `design.md` is not living documentation.

## Invariants

- Source of truth for request shapes, driver enums, and encoder-style argv stays in source.
- No new ADR / `CONTEXT.md`. The systems page remains the durable home.

## Risks

- None

## Implementation

### Files

- `docs/systems/cd-playback.md`
- `docs/systems/companion.md`
- `docs/systems/playback.md`
- `docs/frontend/conventions.md`

### Steps

1. `cd-playback.md`: hardware key + rematch; idle watch (no TOC open while reading); eject drops the reader first; `/cdda/{track}` + `device` query (point at `cdDelivery.ts` / `app.py`, do not paste the URL); desktop icon is session toggle; collapse keeps mode; narrow tab does not leave; CdMini; Media Session is the CD cursor; volume on the CD sink; identify picks the matching medium; `force` Change disc; medium > 1 is stubs only; disc-2 rip-merge leftover; Not an audio CD; Latin-1/MS-JIS CD-Text. Keep out-of-scope list. Refresh source-of-truth file pointers if any path moved.
2. `companion.md`: query device on the WAV; watch does not TOC-poll a live reader; paranoia sequential; STATUS redacts token. Still one sentence plus pointer to `cd-playback.md`.
3. `playback.md`: `PlayStatusState.session` includes `cd`; CD does not use `resolvePlayIntent`; compact status is the CD face; details may list 16/44.1 and exclusive hog when exclusive is on.
4. `conventions.md`: only if it still says the playlist pane *is* the CD list or omits `CdMini` / session toggle. One or two sentences, no chrome inventory.

### Verify

```sh
rg -n "CD button off|playlist pane and /cd are views|/cdda/\\{device" docs/systems/cd-playback.md docs/systems/playback.md docs/systems/companion.md || true
```

Confirm the living pages state idle watch, session toggle, and query `device` in prose, and still link to source for the exact URL.

## Acceptance

- A new agent can find gating, leave vs collapse, rematch, idle watch, and “no disc-1 theft” from `docs/systems/cd-playback.md` without opening this plan.
- No TOC JSON, WAV byte map, or copied FastAPI signature landed in docs.
