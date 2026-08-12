# Stage 06: Phase runners — DB cover sources and force

## Status
done

## Description

Keep enrichment logic in `scan/` as **pure phase functions**. Add DB-driven album→audio path adapter for covers; implement real `force` for artist images (overwrite store, skip cooldown). Register **regen kinds** on the job runner so the only way to run them is `start` / `run_sync` — never a parallel Typer→phase shortcut.

## Rationale

Single phase API + single job API. Cover regen without a walk needs album paths from the index. Artist force must not no-op when an image already exists.

## Implementation

1. **Cover path adapter** in/near `scan/covers.py`:
   - `album_cover_sources(session, library) -> dict[str, Path]` from present tracks.
   - `extract_covers(..., force=..., cancel=...)` unchanged as the write body.
2. **Artist images**
   - `fetch_artist_images(..., force: bool = False)` and `fetch_one(..., force=...)` (or equivalent): force ⇒ ignore cooldown, overwrite store, full local→remote cascade.
   - Non-force: existing `needs_fetch` behavior.
3. **Lyrics**
   - `fetch_track_lyrics(..., force=force)`; extend candidate SQL only if force under-selects.
4. **Job runner kinds** (in `musicweb.jobs`):
   - `regen-covers` / `regen-artist-images` / `regen-lyrics` dispatch to the above with `force` from opts.
   - Update `ScanState.kind` and `phase`; leave scan file counters at 0 for regen kinds.
   - Single-flight shared with `scan`.
5. Full scan (`kind=scan`, `mode=full`) already passes force into all three phases (stage 03); this stage makes artist force real.
6. Greppable logs; cancel callbacks. No Typer in this stage. No new HTTP regen routes required.
