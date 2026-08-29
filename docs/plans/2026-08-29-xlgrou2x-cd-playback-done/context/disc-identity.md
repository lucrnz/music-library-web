# Disc identity (server)

Companion sends a TOC, not a MusicBrainz disc id. The library server computes the id so a bad client cannot poison the cache with a mismatched pair.

## TOC payload

```text
first_track: int          # usually 1
last_audio_track: int     # last Red Book audio track (drop a trailing data track)
leadout_lba: int          # LBA of the lead-out of the audio session
offsets: [int, ...]       # start LBA of each audio track, length = last_audio_track - first_track + 1
```

LBA is the Red Book address libcdio reports (`lsn` / MSF converted the same way libdiscid does). Do not invent a second unit.

## MusicBrainz disc id

Implement the standard MusicBrainz disc-id in `src/musicweb/cd/discid.py` (SHA-1 of the first/last/offsets packed as hex, then RFC 822 base64 with `.` `_` `-`). No `libdiscid` binary on the server. Fixture the well-known TOC `TqvKjMu7dMliSfmVEBtrL7sBSno-` (first=1, last=15, leadout=258725) in tests.

CD-Text is **not** part of the id. Two pressings with the same TOC share an id.

## Lookup

`GET https://musicbrainz.org/ws/2/discid/{id}?inc=artists+recordings+release-groups` with the existing MusicBrainz UA (`MUSICBRAINZ_CONTACT_EMAIL`). Empty / unset email → skip, return `matches: []` and echo CD-Text.

Each match the API returns to the PWA (picker row, no ids yet):

- `release_mbid`, album title, album artist, year, country, label (if present), track count, track titles

`POST /api/cd/identify` **never writes**. Unique vs several vs zero is a **client** decision:

| Server `matches` | Client |
|---|---|
| 1 | `POST /confirm` with that `release_mbid`; no picker |
| >1 | blocking picker; confirm only on pick; dismiss = no confirm |
| 0 / no email | CD-Text or Track N in session memory; no confirm |

Remembered: `GET /api/cd/identities/{discid}` returns the applied DTO or 404. Client applies it and does not open the picker.

## Confirm / remember

Table `cd_identities` (see stage 03): primary key `discid`, columns `release_mbid`, `toc_json`, `confirmed_at`. Re-confirm overwrites. “Change disc…” is another confirm.

`POST /api/cd/confirm` and `GET /api/cd/identities/{discid}` return the **same applied DTO**:

```text
discid, release_mbid, album_id, has_cover,
tracks: [{ id, track_no, title, artist, duration_ms }]
```

`id` is a real `tracks.id` (bound library row or hidden `cd-discid` row). The client must not rebuild this list from `GET /api/albums/{id}/tracks` (`list_for_album` hides `is_missing`).

## Session rows (client)

- Applied DTO → cursor rows with that `id`, `isMissing: false` (even if the DB row is missing), titles from the DTO.
- Unknown / dismissed / CD-Text-only → sentinel `id` `cd:unknown:{n}`, titles Track N or CD-Text, `isMissing: false`. Never persist. `startCycle` rejects `id` that starts with `cd:unknown:`.

## Bind vs hidden

Bind when `album_id_for(artist_id_for(album_artist), title_norm)` exists **and** that album’s **present** track count equals the disc’s audio track count. Map disc track *n* → library row with `track_no=n` (and `disc_no` 1 or NULL). If that slot is missing, treat the whole disc as unowned (do not half-bind).

Unowned: insert/update tracks with `fingerprint_algo="cd-discid"`, `fingerprint="{discid}:{n}"`, `track_id_for` of that pair, `is_missing=true`, `rel_path=NULL`, duration from TOC, `sample_rate_hz=44100`, `bit_depth=16`, `channels=2`, `source_codec="cdda"`, and the same NOT NULL scaffolding as `_new_track` (`size_bytes=0`, `mtime_ns=0`, `added_at` / `indexed_at` now). Album/artist rows may exist with `track_count=0` after recount. Never `fts_upsert` these rows. Never treat `list_for_album` as the apply path.

Cover Art Archive `GET /release/{mbid}/front` → write `$MUSICWEB_DATA_DIR/covers/albums/{album_id}.{full,thumb}.webp` and set `has_cover` only when those files exist. Never persist the gray placeholder.

## CD-Text-only

Do not insert `cd_identities`, tracks, or covers. The PWA keeps titles in session memory.
