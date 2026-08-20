# Stage 02: Batch picker

## Status
done

## Description

Implement eligible-catalog snapshot (paths through `Library.resolve`) and the pure batch picker (artist → album → track, anti-repeat, banlist, loosening, injected ffprobe + RNG). No clock, no HTTP, no lifespan.

## Rationale

Picking is the rule-dense core and the main unit-test surface. Isolating it from the clock lets stage 03 persist whatever the picker returns without re-deriving the rules.

## Invariants

- Album artist is the album’s `artist_id`. Track-artist / feat. credits are not pick keys.
- The middle step is the **album** entity, not `disc_no`.
- Hard filters (missing, duration under 30s, no album) never loosen. See [picking.md](context/picking.md).
- The picker does not persist and does not prune the banlist. `len >= 4` means use last batch only.
- Tests never call real ffprobe or open the developer library.

## Risks

- Loading a full id graph each pick is fine for a personal library; do not add `ORDER BY RANDOM()` SQL as the picker. Randomness stays in the pure function so tests are seeded.
- Logging a failed probe must not print other candidates (queue spoiler).
- Passing `rel_path` to ffprobe skips the path jail.

## Implementation

### Files

- `src/musicweb/config.py`
- `src/musicweb/radio/__init__.py`
- `src/musicweb/radio/types.py`
- `src/musicweb/radio/catalog.py`
- `src/musicweb/radio/picker.py`
- `src/musicweb/radio/probe.py`
- `src/musicweb/db/repositories/radio.py`
- `tests/radio/test_picker.py`
- `tests/radio/test_catalog.py`
- `tests/radio/test_probe.py`

### Steps

1. Add source constants on `config.py` only (no `radio/constants.py`): `RADIO_BATCH_SIZE = 8`, `RADIO_MIN_DURATION_MS = 30000`, `RADIO_BANLIST_MAX_BATCHES = 4`, `RADIO_MAX_PER_ARTIST = 2`, `RADIO_PICK_ATTEMPTS = 32`. Not env.
2. Snapshot types: artist id, album id, track id, duration_ms, **resolved path**, album_artist_id. No source-tech fields.
3. `db/repositories/radio.py` lists present eligible rows (duration, album, not missing, include lossy). `catalog.py` maps rows through `Library.resolve`; `PathEscapeError` / missing path omits the row.
4. `picker.pick_batch(snapshot, banlist_batches, skip_ids, rng, probe) -> Batch`:
   - Banlist is a list of batches (oldest first). If `len >= RADIO_BANLIST_MAX_BATCHES`, banned set is the last batch only.
   - Full rules then loosening. Per slot, at most `RADIO_PICK_ATTEMPTS` draws, then loosen.
   - `probe(path) -> bool`. False → add id to skip set, log at INFO without remaining-candidate ids, continue.
5. `radio/probe.py`: `file_is_playable(path)` runs ffprobe (audio stream present, exit 0, timeout **15s**). Patch `subprocess.run` in tests. Do not decode the whole file. Do not change mutagen-first `probe_source_audio_tech`.
6. Tests with an in-memory snapshot and seeded RNG:
   - 8 unique tracks, ≤2 per album artist
   - no duration under 30s, no missing
   - same track not twice in one batch
   - after four picked batches, only the last batch is banned; `len == 5` still uses last only
   - attempt budget exhausted → loosen (do not spin)
   - 3 artists / few tracks: loosening drops banlist then cap then shrinks
   - 5 eligible tracks → batch of 5, no repeats
   - 0 eligible → empty
   - probe false on one path → that id absent from the batch, another track fills when available
   - album artist vs track artist: cap keys off album artist
   - catalog test: mocked `Library.resolve` failure omits the row

### Verify

- `uv run --group dev pytest tests/radio/`

## Acceptance

- `pick_batch` matches [picking.md](context/picking.md) for the cases above, including attempt budget and `len >= 4`.
- Snapshot paths are resolved; ffprobe never sees a raw relpath.
- Repository snapshot includes lossy present tracks and excludes missing / short / album-less rows.
- No `radio/constants.py`.
- No station clock, Alembic tables, or routes yet.
