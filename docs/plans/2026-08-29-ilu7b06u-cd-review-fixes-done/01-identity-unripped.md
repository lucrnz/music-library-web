# Stage 01: Identity snapshot and unripped stubs

## Status
done

## Description

Replace hidden-row policy filters with a first-class `unripped` flag, persist the applied identity on `cd_identities`, make identify return that snapshot, and make GET a local read. Spec: [identity-and-merge.md](context/identity-and-merge.md).

## Rationale

Scan/FTS/`count_missing` must stop knowing about CDs. Remembered discs must not refetch MusicBrainz. Listens, Stats, and covers still need a `tracks.id`.

## Invariants

- Do not hand-edit applied Alembic history. New revision `016` revises `015_cd_identity`.
- `POST /api/cd/identify` never writes.
- Confirm is the only write of stubs, covers, and snapshots.
- CD-Text-only never writes.
- Do not overwrite `album.has_cover` when it is already true.
- Do not delete artists.
- Do not add `fingerprint_algo` checks in scan/FTS.
- GET without a complete snapshot is 404 (015 leftovers included).
- Companion is not involved.

## Risks

- Deleting current `cd-discid` tracks cascades their listens. Accepted.
- Half-bind onto a deluxe album can leave unripped holes beside present files. Accepted; merge (stage 02) never replaces a present file.
- Identify that finds a complete snapshot skips MusicBrainz, so a newer MB title will not appear until “Change disc…” / re-confirm.

## Implementation

### Files

- `src/musicweb/db/migrations/versions/016_cd_unripped.py`
- `src/musicweb/db/models.py`
- `src/musicweb/db/repositories/cd.py`
- `src/musicweb/db/repositories/tracks.py`
- `src/musicweb/cd/identify.py`
- `src/musicweb/routes/cd.py`
- `src/musicweb/db/fts.py`
- `src/musicweb/scan/identity.py`
- `src/musicweb/scan/finalize.py`
- `tests/cd/test_identify.py`
- `tests/routes/test_cd.py`
- `tests/scan/test_identity.py`
- `tests/scan/test_finalize.py`
- `tests/db/test_fts.py`

### Steps

1. Alembic `016_cd_unripped` as in [identity-and-merge.md](context/identity-and-merge.md): `tracks.unripped`, snapshot columns, delete `cd-discid` tracks (and any `playlist_tracks` refs), delete empty albums.
2. ORM: `Track.unripped` default false; `CdIdentity` snapshot fields. `cd_repo.upsert_identity` writes the new columns. `tracks_repo.count_missing` is `is_missing AND NOT unripped`.
3. `identify.confirm`: full bind or half-bind; persist snapshot; CAA only if `not album.has_cover`. Applied DTO includes `album`, `artist`, `year`.
4. `identify.lookup`: if complete snapshot, return it as `applied` and skip MusicBrainz. Else lookup, `applied` is null.
5. `identify.get_applied`: read snapshot columns only. No `fetch_release`. 404/None when incomplete.
6. `routes/cd.py`: identify response includes `applied`. Keep GET.
7. Remove `fingerprint_algo != "cd-discid"` from `scan/identity.py` `resolve_track` and `scan/finalize.py` `mark_missing` (ORM + SQL). Remove the `cd-discid` early-return from `fts_upsert`.
8. Rewrite tests that assumed hide-from-scan-via-algo and GET-refetches-MB. Add: identify returns `applied` after confirm without HTTP; GET after confirm equals that DTO with MusicBrainz client broken; half-bind reuses a present slot and stubs a hole; cover is not overwritten; `count_missing` ignores unripped; FTS/scan still ignore missing stubs without an algo check.

### Verify

```sh
uv run --group dev pytest tests/cd/test_identify.py tests/routes/test_cd.py tests/scan/test_identity.py tests/scan/test_finalize.py tests/db/test_fts.py
```

## Acceptance

- After confirm, GET and a second identify return the same applied DTO with `album` / `artist` / `year` / `tracks[].id` while the MusicBrainz client raises.
- Identify does not write. Unique/several/zero matches still behave as lookup-only when there is no snapshot.
- Full bind writes no `unripped` rows. Half-bind writes stubs only for holes.
- Confirm does not replace an existing album cover.
- `count_missing` does not count unripped stubs.
- Scan finalize and FTS have no `cd-discid` predicate. Unripped stubs still do not appear in FTS or browse (`is_missing` / `track_count`).
