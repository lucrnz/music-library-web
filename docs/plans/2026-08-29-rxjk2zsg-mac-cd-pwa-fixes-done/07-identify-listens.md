# Stage 07: Identify medium, Change disc, listens

## Status
done

## Description

Pick the MusicBrainz medium whose disc id matches. Do not map a later medium onto disc-1 files. `force` identify skips the snapshot. Share one process-wide MB HTTP client. Apply keeps the cursor index and starts a listen cycle when the playing row gains a real `tracks.id`.

## Rationale

Unique confirm bursts MB (fresh limiter each call) and confirm always takes `media[0]`. Change disc cannot replace a remembered unique hit. Playing during Detecting never upgrades `cd:unknown:` to a listen. Those are the remaining “wrong album / silent 503 / no stats” holes.

## Invariants

- `POST /identify` still never writes. Confirm is the only write. `force` only skips the snapshot read.
- `cd:unknown:` and CD-Text-only still never `startCycle`.
- No Alembic. No `disc_no` on stubs. Disc-2 rip-merge stays broken (accepted).
- CAA still writes only when the album has no cover.

## Risks

- Discids include response may omit `discs` on some releases; fall back to the medium whose `track-count` equals the TOC audio count, then `media[0]`.
- `setCdTracks` default index 0 is used by other callers — add an explicit preserve option, do not change the default silently for `sentinelTracksFromMedia`.

## Implementation

### Files

- `src/musicweb/cd/musicbrainz.py`
- `src/musicweb/cd/identify.py`
- `src/musicweb/routes/cd.py`
- `src/musicweb/http_client.py`
- `frontend/src/api.ts`
- `frontend/src/cd/identifyFlow.ts`
- `frontend/src/stores/cd.ts`
- `tests/cd/test_identify.py`
- `tests/routes/test_cd.py`
- `frontend/tests/cd/identify.test.ts`

### Steps

1. Process-wide MB client: a module-level `RateLimitedHttp` in `musicbrainz.py` (or a `shared()` on `http_client.py`) reused by `lookup_discid` / `fetch_release` / `fetch_cover` when the caller does not inject `http`. Identify then confirm in one process then wait the configured interval.
2. Add `inc=discids` to the discid URL. `_tracks_from_release` selects the medium whose `discs[].id` equals the computed discid; else the medium whose track count matches the TOC; else `media[0]`. Return the 1-based medium position on `ReleaseMatch`.
3. `_try_bind` / `_half_bind`: if medium position > 1, never `_present_slot`; always stubs. Full bind still requires present count == disc audio count **and** medium position 1 (or unknown position treated as 1).
4. `IdentifyIn.force: bool = False`. `lookup(..., force=)` skips `snapshot_dto` when true. `identifyCd` passes `force`. `reopenPicker` / Change disc calls `runIdentify({ force: true })` even when `cd.matches` is empty.
5. `applyCdDto` calls `setCdTracks(rows, preservedIndex)` where preservedIndex is the current `cd.index` if that track number still exists, else 0. After apply, if session is cd, that index is loaded, and the new id is not unknown, `startCycle` (discard any sentinel cycle first).
6. Tests: fixture release with two media — discid of medium 2 yields medium-2 titles; confirm of that discid creates stubs, not disc-1 present ids. `force=true` returns matches even when a snapshot exists. Two MB calls on one client are ≥ the min interval. Client: Change disc with empty matches still force-identifies; apply of a unique confirm while index is 3 keeps index 3; listen starts when id becomes real.

### Verify

```sh
uv run --group dev pytest tests/cd/test_identify.py tests/routes/test_cd.py
pnpm --dir frontend exec vitest run tests/cd/identify.test.ts
```

## Acceptance

- Disc 2 of a multi-CD MB release is titled and stubbed as disc 2, not bound to ripped disc-1 files.
- Change disc on a remembered unique hit opens a fresh lookup (picker if several, auto-confirm if unique).
- Unique identify+confirm does not 503 solely from a second unlimited MB client.
- Playing track N through Detecting then apply logs a listen on the real `tracks.id` and stays on N.
