# Radio picking

Algorithm for one batch. The station clock (see [station.md](./station.md)) calls this when it needs a new batch. Linked from [design.md](./design.md).

## Eligibility

A track is eligible when all of:

- `is_missing` is false and `Library.resolve(rel_path)` succeeds
- `duration_ms` is not null and `>= RADIO_MIN_DURATION_MS` (30000)
- `album_id` is not null (the middle pick step is the album entity)
- album artist id is the album’s `artist_id` (library graph, not the track-artist / feat. credit)

Lossy rows are eligible when they are in the index. Duration under 30s and missing files never are, including after loosening.

## Graph

Build a snapshot in `catalog.py` after resolving paths:

- album artist → albums that have ≥1 eligible track
- album → eligible tracks (id, duration_ms, **resolved absolute path**, album_artist_id)

Artists with no remaining eligible album are absent. Relpaths that fail `Library.resolve` / `PathEscapeError` are omitted (log the skip, not the rest of the catalog). Uniform choice at each step: one artist among remaining artists, then one of that artist’s remaining albums, then one remaining track on that album.

Do not put `SourceAudioTech` on the snapshot. Encode policy looks up `tech_from_track` at stream/prepare time.

## Batch rules (full)

While the batch has fewer than `RADIO_BATCH_SIZE` (8) and a pick exists:

1. Draw artist → album → track from the snapshot after removing tracks already in this batch and tracks on the banlist.
2. Reject the draw if that album artist already has `RADIO_MAX_PER_ARTIST` (2) tracks in this batch; draw again.
3. Run the ffprobe validity seam on the **resolved** path. Failure: the **caller** (`RadioStation`) adds the id to its process-lifetime `skip_ids` and the picker drops it from the snapshot; do not persist it on the banlist; log the skip (title/artist or track id — not remaining candidates); draw again. Stage 03 must pass `skip_ids` into every `pick_batch`.
4. Append the track.

Per slot, at most `RADIO_PICK_ATTEMPTS` (32) draws under the current loosening tier, then loosen.

## Banlist

Identity is the stable track id (fingerprint primary key).

- A batch enters the banlist when it is **picked**, not when it finishes.
- The picker receives an ordered list of batches (oldest first). It does not mutate persistence.
- If `len(banlist_batches) >= RADIO_BANLIST_MAX_BATCHES` (4), the picker uses **only the last batch** as the banned set. `len > 4` is a caller bug; same “last only” behavior.
- The **station** owns persist prune: if appending a newly picked batch would make five, save `[previous, new]` only.

Example: after A, B, C, D are persisted (four batches), E is drawn against D only; the store then keeps `[D, E]`.

Catch-up uses the same rule: a last-track start that happened in the past still picks the next batch and updates the banlist.

## Loosening

If a slot cannot be filled under the full rules (budget exhausted or no legal draw):

1. Drop the oldest banlist batch from the constraint (then the next oldest) until a pick exists or the banlist is empty.
2. If still stuck, drop the max-2-per-artist cap for the rest of this batch.
3. If the whole library has fewer eligible tracks than 8 (after skip-set and hard filters), stop. Batch size is that count. Do not repeat a track inside the batch.
4. If zero eligible tracks remain, return an empty batch. The station becomes idle.

Never loosen the 30s floor, missing files, or “must have an album.”

## Seams

- Catalog I/O (`Library.resolve`, SQL) stays out of the picker. The picker is a pure function of snapshot + banlist + skip set + RNG + probe.
- ffprobe is an injected callable (`file_is_playable(path) -> bool`, timeout 15s). Tests never spawn a process.
- RNG is `random.Random` (or a protocol with `choice`); tests pass a seeded instance.
- Constants live in `config.py` only. Do not add `radio/constants.py`.
