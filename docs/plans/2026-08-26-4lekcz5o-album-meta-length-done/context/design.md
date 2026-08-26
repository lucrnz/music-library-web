**Archive.** Decisions in this file were current as of 2026-08-26 (the plan date in the directory name). They may be outdated. Do not treat this as living documentation. This plan directory is an archive.

# Album year, track count, and length

## Goal

Show release year, track count, and total length on every in-scope album entity surface, and show the playing track’s year on now-playing and radio. Album lists must not fetch tracks to compute length.

## Settled decisions

- Album meta line uses middot separators. Omit a segment when that value is missing. Never print `0:00` for an unknown album length.
- Artists-tree album subtitle: `Year · N tracks · m:ss`.
- Albums-tree album subtitle, `AlbumCard`, and `AlbumListRow` (library + search): `Artist · Year · N tracks · m:ss`.
- Album page chrome: keep the title; add a new muted subtitle `Year · N tracks · m:ss`. Artist is not repeated (back already goes to the artist).
- Track count grammar is `1 track` / `N tracks` on every surface this plan touches, including the existing `AlbumListRow` string.
- Total length is the sum of `duration_ms` on every present (`is_missing = 0`) track of that album.
- If any present track has `duration_ms IS NULL`, album length is unknown: store and send null, omit the length segment.
- Persist `albums.duration_ms` at scan finalize, the same pass that already rewrites `track_count`. Migration backfills with that SQL so existing libraries do not wait for a rescan.
- Print length with existing `formatTime` (`m:ss`, no hours). 70 minutes is `70:12`.
- Now-playing (PlayerBar mini + expanded sheet) and radio: `Artist - Album (year)` using `tracks.year`. Missing year drops the parentheses. Queue does not gain a year.
- User-facing separator dashes are ASCII hyphen-minus (` - `), not em dash. A standalone empty-value glyph `—` (missing title, settings blank) stays. Comments and Python/docs outside the named frontend copy are not a blind repo sed.
- Downloads catalog, queue year, track-row duration, copy menus, stats, and now-playing/radio track-count or album-length are out of this plan.

## Design

Album length cannot be summed on cards, trees, or search: those payloads are `Album`, not tracks. Scan finalize already denormalizes `track_count` and `lossy_kind`. Add nullable `albums.duration_ms` and recount it there.

Recount rule (present tracks only):

- no present tracks → `NULL`
- any present track with `duration_ms IS NULL` → `NULL`
- else `SUM(duration_ms)`

`album_dict` grows `duration_ms` and `duration` (seconds float), matching `track_dict`. Client `Album` grows `duration` / `durationMs`. `LibraryAlbum` picks them up. Shared `formatAlbumMeta` / `formatTrackCount` in `frontend/src/util.ts` own the browse strings so cards, list rows, both trees, and chrome cannot drift.

Album page chrome is title-only today (`.view-title` inside a fixed 56px `.view-bar`). Stack a `.view-sub` under the title and let `.view-bar` grow via `min-height` instead of a fixed `height`.

Now-playing and radio already join `artist` and `album`. One `formatPlayingSubtitle` helper: hyphen join, then ` (year)` from `track.year` when present. PlayerBar feeds both the mini bar and the expanded sheet. Radio uses the same helper. Queue keeps `Artist - Album` with no year (hyphen only, in the copy sweep).

Downloads reuse `AlbumCard` / `AlbumListRow` / album-page chrome. Offline albums often lack `year` and `duration`; those segments omit. Track count may appear on downloads cards as a side effect of the shared formatters. Downloads tree subtitles stay as they are.

## Stage map

1. Persist and expose `duration_ms` (column, finalize, backfill, serializer). Browse UI cannot show length without this field.
2. Client album fields plus the shared formatters. Surfaces must not each invent pluralization or omit rules.
3. Wire the album entity surfaces and album-page subtitle. This is the original product.
4. Now-playing and radio year line. Independent of the album aggregate; comes after the browse work because it is the add-on, not the blocker.
5. Remaining user-facing em dashes → hyphen. After stage 04 so PlayerBar/radio are not rewritten twice.
6. Living docs for the two decisions that outlive this plan: finalize duration recount, and hyphen/album-meta display rules.

## Out of scope

- Downloads tree / `albumFromDl` year or duration fields
- Queue subtitle year
- Per-track duration on library `TrackRow`
- Hour-aware duration (`h:mm:ss`)
- Computing album length only on the client
- Replacing standalone empty-value `—`
- Blind replace of em dashes in comments, Python, or docs outside the living-docs stage
- Changing how `albums.year` is chosen at scan (still first tagged year, never overwritten)

## Assumptions

- Household library size makes a single `UPDATE albums SET duration_ms = (SELECT …)` at finalize and migrate acceptable.
- `formatTime` remaining `0:00` for null/invalid is unchanged; album meta must not call it with null.
- Year `0` stays falsy and is omitted, matching today’s card/list checks.
- Vue chrome is not unit-tested; stage 03 acceptance is typecheck plus formatter tests, with browser verification required at implementation time.
