**Archive.** Decisions in this file were current as of 2026-08-20 (the plan date in the directory name). They may be outdated. Do not treat this as living documentation. This plan directory is an archive.

# Replace wipe-all cache clear with id-scoped forget

## Goal

Stop offering a human-triggered full stream-cache wipe. Queue edits that drop a track from the on-demand queue ask the server to forget that track’s process-temp encodes, except tracks the household radio still has coming up. The only full wipes stay idle eviction and process shutdown.

## Settled decisions

- Delete `POST /api/cache/clear` (`scope=streams` full wipe) and every frontend caller (`clearCache`, including `clearPlaylist`).
- Delete `StreamCacheIdle.run_clear` and `test_run_clear_does_not_note_swept`. The idle sweeper (`sweep_if_due`) and shutdown wipe stay.
- No CLI, doctor, or Settings replacement for a full wipe.
- Add `POST /api/transcode/forget` with body `{ ids }`. It sits next to `/api/transcode/prepare`. Response is counts only (`forgotten` / `skipped`). Never list ids — upcoming radio ids must not leak.
- **Clear queue** and **row remove** are the only client actions that forget. Loading a saved playlist (which `pl.clear()`s then adds) does not forget.
- The client sends an id only when that track **no longer appears** in the remaining queue. Duplicates: removing one of two copies of A does not forget A. Clear-all sends every unique queue id.
- For each unprotected id, drop queued and running encodes **and** delete completed cache files, **every** stream profile (browser + exclusive tags). The client does not send a codec.
- Radio exception is **current + remaining only**: the station’s current track and every id after it in the live `radio_queue` batches. Already-played rows still sitting in the current batch may be forgotten. Banlist-only ids are not protected.
- Tuner count does not matter. Simulation (0 tuners) still has a current + remaining set and those ids are protected. Protection is by track id against that set, not by `log_label`.
- Client call is fire-and-forget (same as today’s `clearCache`). Drop `preparedKeys` entries for forgotten ids (`id|…`).
- Another browser tab with its own queue may lose cache for forgotten ids. There is no server-side union of client queues.
- No new ADR. Living system docs record the new contract.

## Design

Today `clearPlaylist` POSTs `/api/cache/clear?scope=streams`. That path runs `Transcoder.clear_cache()` under `StreamCacheIdle.run_clear`: drain every job, cancel the running encode, delete the whole process-temp `streams/` tree. Row remove does not call it. The same `clear_cache` is what the ~1h idle sweeper and process shutdown already use.

After this plan, HTTP cannot wipe the tree. Queue clear and last-row-of-a-track remove send discarded ids to `POST /api/transcode/forget`. The route unique-s the list, subtracts `RadioStation` current + remaining ids, resolves the rest to `rel_path`s, and asks the transcoder to forget those paths across `PROFILES`. Missing, lossy, and unreadable rows count as skipped (nothing to delete). Empty `ids` is a 200 no-op.

Cache files are `sha256(rel_path + profile)` names, not track ids. Forget is therefore “resolve id → path, then drop every job and file whose path/profile key matches.” A running job for a forgotten path is `purged` and canceled the same way `clear_cache` cancels `_current`, but only that job — other work keeps running.

Radio prepare is unchanged: still current urgent + next-2 prewarm, only when tuners ≥ 1. Forget’s protect set is wider than the prepare set (whole remaining queue, not just next 2) and applies even in simulation so a later Tune-in is not a cold miss for tracks the station is about to play. Forget must not log or return the skipped id set.

Idle eviction is unchanged: after about an hour with no in-flight HTTP and no recent request, `sweep_if_due` still calls `Transcoder.clear_cache()`. Forget of some files must not `note_swept`. Forget and the sweeper share the idle asyncio gate so a selective delete does not race a directory wipe. That gate helper is a renamed exclusive runner, not the old `run_clear` HTTP hook.

The SPA keeps `preparedKeys` as an in-memory “already prepared” set. After forget, those keys are stale; the client deletes `id|*` for every id it actually sent.

## Stage map

1. **Forget primitive + radio retain set** — no HTTP. Worker and station grow the operations the route will call. Tests can pin “current + remaining” and “drop jobs + all profile files” without a client.
2. **HTTP surface** — depends on 01. Add `/api/transcode/forget`, delete `/api/cache/clear`, delete `run_clear`. This is the server contract change.
3. **Frontend callers** — depends on 02 so the new path exists. Stop calling wipe-all; send last-occurrence ids from clear-queue and row-remove.
4. **Living docs** — last so transcoding, playback, and radio pages describe shipped behavior rather than the old wipe-all POST.

## Out of scope

- Changing idle interval, idle HTTP accounting, or shutdown wipe
- A CLI / doctor / Settings cache wipe
- Forgetting on saved-playlist load or any other queue replacement
- Protecting banlist ids or already-played rows in the current radio batch
- Per-file in-flight stream tracking (another tab may lose a file it is Range-reading)
- Radio prepare policy (still current + next 2, tuners ≥ 1 only)
- Serializing upcoming radio ids anywhere

## Assumptions

- Household use means one typical on-demand queue; a second tab losing cache for discarded ids is acceptable.
- `RadioStation.now_playing()` / in-memory `_batches` are the retain set. No extra SQLite read on the forget path.
- `PROFILES` is the complete set of encodings that can exist under `streams/`.
- Unix unlink of a file another client still has open is acceptable.
- `preparedKeys` is process-memory only; a reload already drops it.
- Queue length stays within prepare’s 1000-id cap; if a clear exceeds it, the client chunks.
