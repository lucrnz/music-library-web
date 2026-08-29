# Identity, half-bind, snapshot, merge

Linked from [design.md](design.md). Source of truth for stage 01 and 02.

## Applied DTO

```text
discid, release_mbid, album_id, album, artist, year, has_cover,
tracks: [{ id, track_no, title, artist, duration_ms }]
```

`album` / `artist` / `year` are the confirmed MusicBrainz release fields. `id` is always a real `tracks.id`. The client must not rebuild this list from `GET /api/albums/{id}/tracks`.

## `cd_identities` after 016

| column | role |
|---|---|
| `discid` | PK |
| `release_mbid` | confirmed pick |
| `toc_json` | TOC used at confirm |
| `confirmed_at` | stamp |
| `album_id` | library album (null = cache miss) |
| `album`, `artist`, `year` | display snapshot |
| `has_cover` | CAA written this confirm **or** album already had a cover |
| `tracks_json` | applied `tracks[]` |

A row is a **complete snapshot** when `album_id` and `tracks_json` are non-null. Incomplete rows (today’s 015 leftovers) are a cache miss.

## Confirm

1. Fetch the MusicBrainz release (404 if unknown).
2. **Full bind** if `album_id_for` exists and **present** track count (disc 1 / `NULL`) equals TOC audio count and every slot has a present row → those ids, no stubs.
3. Else **half-bind** on `ensure_album` (same name-based id):
   - present slot at `track_no` → that id
   - hole → upsert unripped stub: `unripped=true`, `is_missing=true`, `rel_path=NULL`, `fingerprint_algo="cd-discid"`, `fingerprint="{discid}:{n}"`, `id=track_id_for` of that pair, same NOT NULL scaffolding as `_new_track`, titles from the match, duration from TOC
4. Cover: if `album.has_cover` is false and CAA bytes exist, write `covers/albums/{album_id}` and set `has_cover`. Otherwise leave the album cover alone; snapshot `has_cover` is the album’s flag after that step.
5. Upsert `cd_identities` with the snapshot. Overwrite on “Change disc…”.
6. Return the applied DTO.

CD-Text-only / dismissed picker / unknown: no confirm, no write.

## Identify

- Compute discid from TOC.
- Complete snapshot → `{ discid, matches: [], applied, cd_text }`. No MusicBrainz.
- Else lookup as today → `{ discid, matches, applied: null, cd_text }`. No write.

## GET

Read the snapshot. 404 if missing or incomplete. No MusicBrainz.

## Merge (scan)

After `resolve_track` + `apply_track_fields` have a present file with `album_id` and `track_no`:

- If this album has an **unripped** row at that `track_no` (disc 1 / `NULL`) **and** no *other* present row occupies that slot:
  - Move the file onto the stub: content `fingerprint` / `fingerprint_algo`, `rel_path`, tech fields, `is_missing=false`, `unripped=false`. Keep the stub `id`.
  - Delete the transient `resolve_track` row (it has no listens).
- If a present file already occupies that slot: do not touch the stub. Normal new-track path.
- Fingerprint unique constraint: update the stub after the transient row is gone (or swap in one flush that frees the new fingerprint first).

`mark_missing` keys on present + `rel_path IS NOT NULL`. Unripped stubs have no path; drop the `fingerprint_algo != "cd-discid"` extra predicate.

`resolve_track` fingerprint lookup must not skip `cd-discid` rows once merge has rewritten them — after merge they are not `cd-discid`. Before merge their fingerprint is not a content hash, so they cannot win a file reattach. Drop the `!= "cd-discid"` filter.

`fts_upsert` of an unripped or missing row is still a no-op via `is_missing` (rebuild already `is_missing = 0`). Delete the algo early-return.

## `count_missing`

`is_missing AND NOT unripped`.

## Migration 016

1. `tracks.unripped` boolean not null default false.
2. Snapshot columns on `cd_identities` (all nullable except add `has_cover` default false).
3. `DELETE` `playlist_tracks` whose `track_id` is a `cd-discid` track (defensive; should be empty).
4. `DELETE FROM tracks WHERE fingerprint_algo = 'cd-discid'` (`listen_events` cascade).
5. `DELETE` albums with no remaining tracks.
6. Do not delete artists. Do not delete `cd_identities` (they become cache misses until confirm).
