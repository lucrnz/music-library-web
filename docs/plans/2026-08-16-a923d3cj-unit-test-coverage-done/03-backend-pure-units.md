# Stage 03: Backend pure units

## Status
done

## Description

Unit-test library path jail, name/id helpers, FTS query + upsert/search, lyrics parse, artist-image JSON pickers, and API serializers.

## Rationale

These are the isolated building blocks identity, scan, and HTTP responses already trust. They need no fingerprint or job runner, so they can land as soon as the harness exists.

## Invariants

- No `create_app`, no ffmpeg, no outbound HTTP.
- `db.names` IDs stay content-stable: same normalized input → same id (do not change hash algorithms).
- Serializers do not invent new JSON keys; they lock today’s keys from `routes/serializers.py`.

## Risks

- `Library.browse` on a tmp tree will try real `is_indexable_audio` (suffix-based). Empty `.flac` files are enough; do not add audio payloads.
- FTS5 `MATCH` syntax is SQLite-version sensitive; stick to simple prefix tokens from `fts_query_string`.

## Implementation

### Files

- Create: `tests/library/test_path_jail.py`
- Create: `tests/library/test_browse.py`
- Create: `tests/db/test_names.py`
- Create: `tests/db/test_fts.py`
- Create: `tests/lyrics/test_parse.py`
- Create: `tests/artist_images/test_pick.py`
- Create: `tests/routes/test_serializers.py`

### Steps

1. **Library jail** (`Library.resolve`): `..`, `/etc/passwd`, `~/`, backslash-normalized escape → `PathEscapeError`. Empty / `.` → root. Happy relative path stays under `tmp_home.lib`.
2. **Browse / collect:** tmp tree with `01.flac`, `2.flac`, `10.flac`, `notes.txt`, `.hidden.flac`, a subdir. `browse` returns only dirs + flac, natural order `2` then `10`. `collect_audio` recursive; `index_lossy=False` omits a sibling `.mp3`.
3. **Names:** `normalize_name` / `display_name` fallbacks (`UNKNOWN_*` via the functions’ callers’ expected empty handling); `artist_id_for("radiohead")` stable across calls; `album_id_for` changes when artist id changes; `track_id_for("flac-md5", fp)` ≠ different algo.
4. **FTS:** table-drive `fts_query_string` (`"hello world"` → `"hello* world*"`, punctuation stripped, blank → `""`). Using `db` fixture: `fts_upsert` a row, `fts_search_track_ids` finds it by prefix, unknown token → `[]`, `fts_rebuild` after inserting a non-missing track via ORM (minimal Artist/Album/Track) returns 1 and after marking missing + rebuild returns 0.
5. **Lyrics parse:** remastered brackets/dashes; LRC vs plain; `plain_from_lrc` drops timestamps; `normalize_lyrics_text` None/blank.
6. **Artist pick:** Last.fm placeholder URL rejected; `mega` beats `small`; MB exact name wins; score 95 fallback; Wikimedia `File:` rewritten to `Special:FilePath`; fanart prefers thumb list.
7. **Serializers:** build in-memory `Track`/`Album`/`Artist`/`TrackLyrics` (no DB required if instances are constructed and relationships set). Missing track → `path is None`. Instrumental lyrics → `plain_text`/`synced_lrc` None and `instrumental True`. Pending None row → `status == "pending"`.

### Verify

```sh
uv run --group dev pytest tests/library tests/db tests/lyrics tests/artist_images tests/routes/test_serializers.py
uv run --group dev pytest
```

## Acceptance

- [ ] Path escape cases raise `PathEscapeError`; browse/collect honor suffix + natural sort.
- [ ] Name IDs are stable; FTS prefix search works on the migrated tmp DB.
- [ ] Lyrics parse and artist-image pick cover the functions listed in [coverage-inventory.md](context/coverage-inventory.md).
- [ ] Serializer tests lock missing-path, `lossy_kind`, and instrumental/pending lyrics shapes.
