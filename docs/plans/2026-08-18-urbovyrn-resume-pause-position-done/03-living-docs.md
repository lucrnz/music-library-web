# Stage 03: Living docs

## Status
done

## Description

Record the resume-position contract on the playback system page so the next change does not rediscover “queue restore only, always start at 0.”

## Rationale

`docs/systems/playback.md` is the owner for what the client persists and how Play starts. The plan directory is not living documentation.

## Invariants

- Edit `docs/systems/playback.md` only. Do not add an ADR or a new system page.
- Do not treat this plan directory as the source of truth after this stage.
- Do not document encoder argv, exact handler names, or test file lists.

## Risks

- None

## Implementation

### Files

- Change: `docs/systems/playback.md` (resume-position paragraph; mention `playbackPosition.ts` next to the existing player-module sentence)
- Do not change: `docs/README.md`, `docs/frontend/conventions.md`

### Steps

1. In the player-module sentence (playlist / `playerState` / `playerSession` / `playerPrefs` / loaders), add that resume position is `playbackPosition.ts` (`musicweb.playbackPosition.v1`).
2. Add a short **Resume position** section:
   - Written on any pause and on page hide / document hidden; also on seek while paused.
   - One `{ trackId, seconds }` slot for the current track, not the playlist blob.
   - Boot hydrates the bar from that slot + the track tag duration; media is not loaded; Play is not started.
   - Seek runs only on the first Play while `playSource` is still `none`. An already-loaded tap of the current row still starts at 0 and clears the slot.
   - Apply only when ids match. Clear on stop, skip, track end, and a different-track load.
   - Within 3s of duration (or past the end) restores at 0.
   - Exclusive companion uses the same rules; seek waits for duration.
   - Auto-play on restore is out of product scope.

### Verify

```sh
# docs only
```

Read the new section and confirm it matches shipped stage 02 behavior, not this plan’s file names.

## Acceptance

- [ ] `docs/systems/playback.md` states the key, write triggers, cold-load seek, invalidation, 3s rule, companion, and no auto-play.
- [ ] This plan is not cited as the source of truth.
