# Stage 08: CD listens

## Status
done

## Description

Count a listen only when the playing CD row is MB-identified (bound library `track_id` or hidden `cd-discid` id). Ingest accepts `origin=cd` and `play_source=cd` with profile `cdda`. Rankings stay mixed.

## Rationale

Stats should record sitting-at-the-Mac CD plays of known albums with real covers, without counting Track N or CD-Text-only sessions.

## Invariants

- Unidentified and CD-Text-only rows use sentinel ids `cd:unknown:{n}`. `startCycle` is not called when `id` starts with `cd:unknown:`.
- `play_source` `cd` is delivery (optical). `origin` `cd` is session. Exclusive hog does not change either.
- Omitted ingest `origin` stays `queue`; omitted / old outbox `play_source` stays `streaming`|`downloaded` only. New literals are additive.
- Rankings SQL does not filter by origin. No Stats chip.
- 65% / pause / seek / late-resume rules unchanged.
- Unknown `track_id` still 422.

## Risks

- Widening `ListenPlaySource` without teaching `createListenCycle`’s `canFire` would silently drop CD events.

## Implementation

### Files

- `src/musicweb/routes/listens.py`
- `frontend/src/listens/accumulator.ts`
- `frontend/src/listens/outbox.ts`
- `frontend/src/playback/cdLoad.ts`
- `tests/routes/test_listens.py`
- `frontend/tests/listens/accumulator.test.ts`
- `frontend/tests/listens/outbox.test.ts`

### Steps

1. `ListenIn.origin` becomes `Literal["queue", "radio", "cd"]` (default `queue`). `play_source` becomes `Literal["streaming", "downloaded", "cd"]`. No Alembic change (both columns are free strings).
2. `ListenPlaySource` / `ListenOrigin` in `accumulator.ts` gain `"cd"`. `canFire` accepts them. Outbox validate accepts `play_source === "cd"` and `origin === "cd"`.
3. In `frontend/src/playback/cdLoad.ts`, after a successful load, if the cursor row `id` does not start with `cd:unknown:`, `startCycle({ origin: "cd", playSource: "cd", profile: "cdda", trackId })`. Time/ended from the companion sink while session is `cd`. Leave CD / eject / new load `discard()`.
4. Tests: POST `origin=cd` + `play_source=cd` is 204 and ranks with queue/radio; `origin=cd` + unknown track 422; accumulator fires at 65% for cd/cd; outbox keeps a `cd` row; `canFire` / startCycle reject `cd:unknown:1`.

### Verify

```sh
uv run --group dev pytest tests/routes/test_listens.py
pnpm --dir frontend exec vitest run tests/listens/accumulator.test.ts tests/listens/outbox.test.ts
```

## Acceptance

- Playing 65% of an MB-identified CD track writes a listen that appears in Stats with that album’s stored cover.
- Track N / CD-Text-only plays write nothing.
- Rankings counts do not split by origin.
- Older outbox rows without the new literals still flush.
