# Stage 04: Radio picks performing artists, not album artists

## Status
done

## Description

Rebuild the radio catalog and picker around performing `artist_id`. VA as album artist is exploded into per-performer subalbums. The existing track-id banlist also derives a performing-artist ban (except `VA_ARTIST_ID`). Remove the 2-per-album-artist cap.

## Rationale

Today the lottery is uniform over album artists and the banlist is track ids only, so Nirvana’s studio cut and Nirvana on a VA disc are unrelated, and the whole compilation pile is one urn capped at two tracks. This stage is the settled fairness + anti-repeat rule.

## Invariants

- Graph key is `track.artist_id`. Album-artist VA is not a key.
- A performer’s album node contains only that performer’s eligible tracks on that album (owned disc or VA / guest appearance).
- Tracks whose performer is `VA_ARTIST_ID` stay eligible on a VA performer node so badly tagged comps are not dropped; that id is never added to the artist-ban set.
- Banlist storage remains batches of track ids with the same retention and `_effective_banlist` rules.
- Same track still cannot appear twice in a batch. Loosening: drop oldest effective ban batches, then allow a short batch. No artist-cap rung.
- Small-library / idle rules otherwise unchanged (30 s, ffprobe skip_ids, batch size 8).

## Risks

- A guest-heavy library grows the urn count (settled). Tests must not assume album-artist cardinality.
- Existing `test_artist_cap_uses_album_artist_not_track_artist` and any helper that groups by `album_artist_id` will fail until rewritten.
- Banlist tracks missing from the new catalog cannot contribute an artist key; they still exclude their track id.

## Implementation

### Files

- `src/musicweb/config.py`
- `src/musicweb/radio/types.py`
- `src/musicweb/radio/catalog.py`
- `src/musicweb/radio/picker.py`
- `src/musicweb/radio/station.py`
- `src/musicweb/db/repositories/radio.py`
- `tests/radio/test_picker.py`
- `tests/radio/test_catalog.py`

### Steps

1. Add `artist_id: str` to `EligibleRow` and `CatalogTrack` in `src/musicweb/radio/types.py`. Keep `album_artist_id` on the row (needed to detect VA albums and for snapshot display paths that already read it).
2. In `src/musicweb/db/repositories/radio.py` `list_eligible_rows`, select `Track.artist_id` as well as `Album.artist_id`. Omit a row with a null `artist_id` (cannot form an urn).
3. In `src/musicweb/radio/catalog.py` `snapshot_from_rows`, insert each track under `track.artist_id` → `album_id` (not under `album_artist_id`). The snapshot docstring becomes performer → album → tracks.
4. In `src/musicweb/radio/picker.py`:
   - Delete the album-artist cap: remove `counts` / `cap_enabled` / the `RADIO_MAX_PER_ARTIST` branch. Loosening loop only increments `ban_drop`, then breaks into a short batch.
   - When building `exclude`, also skip any remaining track whose `artist_id` is in `{t.artist_id for t in batch}` ∪ artist ids resolved from banned track ids still present in the working snapshot, except `VA_ARTIST_ID`.
   - Resolve banned artist ids by scanning `snapshot.all_tracks()` (or a dict built once per slot) for banlist track ids; a banlist id not in the snapshot contributes no artist key.
5. In `src/musicweb/radio/station.py` operator/debug `CatalogTrack` construction, pass `artist_id` (the Track row’s performing id; refuse `not_eligible` when it is missing, same as catalog).
6. Remove `RADIO_MAX_PER_ARTIST` from `src/musicweb/config.py`.
7. Rewrite `tests/radio/test_picker.py`: drop the album-artist cap tests; add (a) Nirvana studio then Nirvana-on-VA cannot share a window, (b) two different performers on the same VA album can, (c) many VA-performer tracks can appear when `artist_id == VA_ARTIST_ID`, (d) loosening no longer mentions a cap, (e) helpers construct `artist_id`.
8. Update `tests/radio/test_catalog.py` for the new `EligibleRow` field and performer grouping (a VA album with two guests becomes two performer keys).

### Verify

- `uv run pytest tests/radio/test_picker.py tests/radio/test_catalog.py tests/radio/test_station.py tests/control/test_radio.py`
- `rg -n "RADIO_MAX_PER_ARTIST" src tests` is empty.

## Acceptance

- Picking Bon Jovi can return either an owned album or a VA subalbum that contains only his tracks.
- After a Nirvana pick, no other Nirvana `artist_id` track is chosen until that pick ages out of the effective ban window (including the next slot in the same batch).
- A batch may contain many compilation tracks from different performers. Tracks tagged artist=VA are not artist-banned.
- Station persist, spoilers, and forget-retain behavior are unchanged.
