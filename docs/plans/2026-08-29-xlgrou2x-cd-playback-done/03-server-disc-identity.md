# Stage 03: Server disc identity

## Status
done

## Description

Library server computes a MusicBrainz disc id from a TOC, looks up releases + Cover Art Archive, remembers a confirmed pick, and either binds to an owned album or upserts hidden `cd-discid` rows. Spec: [disc-identity.md](context/disc-identity.md).

## Rationale

Listens require a real `tracks.id`. Covers for Stats must live in the data dir. The PWA must not speak MusicBrainz.

## Invariants

- Do not hand-edit applied Alembic history. New revision only, revises `014_album_duration`.
- `cd-discid` tracks stay `is_missing=true` and `rel_path` NULL forever. Scan `mark_missing` / identity / FTS must not delete, re-fingerprint, or index them.
- Radio catalog and `present_audio` never see them as playable.
- Artists/Albums/Search stay empty of unowned CD-only albums (`track_count > 0` already excludes them after recount).
- Unset `MUSICBRAINZ_CONTACT_EMAIL` → no outbound MB/CAA; `matches: []`.
- `POST /api/cd/identify` never writes `cd_identities`, tracks, or covers. Writes happen only in `POST /api/cd/confirm`.
- Confirm and GET return the same applied DTO including `tracks[].id`. Clients must not use `list_for_album` to rebuild the disc.
- Hidden inserts set `size_bytes`, `mtime_ns`, `added_at`, `indexed_at`. Never `fts_upsert` `cd-discid` rows.
- CD-Text-only never writes `cd_identities`, tracks, or covers (client never confirms).
- Placeholders are never written and never set `has_cover`.
- Companion is not involved.

## Risks

- Album-id bind on a remaster with the same title and count can attach to the wrong pressing. Accepted (Q25).
- CAA or MB rate limits: use `RateLimitedHttp` and the existing UA; on failure return matches already in hand or `[]`, do not 500 the identify POST.

## Implementation

### Files

- `src/musicweb/db/migrations/versions/015_cd_identity.py`
- `src/musicweb/db/models.py`
- `src/musicweb/db/repositories/cd.py`
- `src/musicweb/db/repositories/__init__.py`
- `src/musicweb/db/fts.py`
- `src/musicweb/cd/__init__.py`
- `src/musicweb/cd/discid.py`
- `src/musicweb/cd/musicbrainz.py`
- `src/musicweb/cd/identify.py`
- `src/musicweb/routes/cd.py`
- `src/musicweb/routes/api.py`
- `src/musicweb/scan/identity.py`
- `src/musicweb/scan/finalize.py`
- `tests/cd/test_discid.py`
- `tests/cd/test_identify.py`
- `tests/routes/test_cd.py`
- `tests/scan/test_identity.py`
- `tests/scan/test_finalize.py`
- `tests/db/test_fts.py`

### Steps

1. Alembic `015_cd_identity`: table `cd_identities` (`discid` PK, `release_mbid`, `toc_json`, `confirmed_at`). No change to `listen_events` yet.
2. ORM + `src/musicweb/db/repositories/cd.py` (`get`, `upsert_identity`).
3. `src/musicweb/cd/discid.py` implements the MB disc-id; fixture `TqvKjMu7dMliSfmVEBtrL7sBSno-`.
4. `src/musicweb/cd/musicbrainz.py` queries discid + CAA front image using `http_client.RateLimitedHttp` and the artist-image UA. Map releases to the picker DTO in [disc-identity.md](context/disc-identity.md).
5. `src/musicweb/cd/identify.py`: `lookup(toc, cd_text)` returns matches only; `confirm(discid, release_mbid, toc)` applies bind-or-hide, stores CAA, upserts `cd_identities`, and returns the applied DTO in [disc-identity.md](context/disc-identity.md). Bind rule: album-artist + title **and** present track count. Hidden path uses `track_id_for("cd-discid", f"{discid}:{n}")` plus `_new_track` NOT NULL columns. Do not `fts_upsert`.
6. Routes in `src/musicweb/routes/cd.py`: `POST /api/cd/identify` (lookup), `POST /api/cd/confirm` (write + DTO), `GET /api/cd/identities/{discid}` (same DTO or 404). Include the router from `src/musicweb/routes/api.py`.
7. `src/musicweb/scan/identity.py`: never select `fingerprint_algo == "cd-discid"` as a reattach candidate. `src/musicweb/scan/finalize.py`: `mark_missing` already keys on `rel_path IS NOT NULL` — add an explicit `fingerprint_algo != 'cd-discid'` in the UPDATE so a future path cannot touch them. `src/musicweb/db/fts.py`: skip `cd-discid` on upsert (rebuild already skips `is_missing`).
8. Tests: discid fixture; identify with a stub HTTP client (unique / several / zero / no email) writes nothing; confirm bind vs hide returns `tracks[].id`; GET after confirm equals that DTO; GET unknown is 404; scan finalize does not delete a hidden row; FTS search does not return it.

### Verify

```sh
uv run --group dev pytest tests/cd/test_discid.py tests/cd/test_identify.py tests/routes/test_cd.py tests/scan/test_identity.py tests/scan/test_finalize.py tests/db/test_fts.py
```

## Acceptance

- Known TOC produces the canonical MusicBrainz disc id.
- Unique MB hit is one match from identify and writes nothing until the client confirms; confirm binds or writes hidden rows + a real cover and returns `tracks[].id`.
- Several hits return a list and write nothing until confirm.
- Zero hits / no email write nothing. GET without a prior confirm is 404.
- A later scan does not remove hidden rows or list them in browse/FTS/radio.
