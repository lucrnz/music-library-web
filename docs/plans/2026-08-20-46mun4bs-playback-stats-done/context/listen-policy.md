# Listen policy (plan attachment)

Canonical rules for stages 03–04. Not living documentation after the plan ships — the systems page replaces this.

## Play cycle

A cycle starts when:

- a load becomes `streaming` or `downloaded` after a **successful** html or exclusive start (`startCycle` from `listens/bridge.ts`), or
- the playhead restarts near 0 on the same load: repeat-one after `ended`/`eof`, or `playPrev` when `currentTime > 3` (existing 3s threshold, not the 2s seek epsilon). That path is `onRestart()` only.

A cycle ends when `discard()` runs (`beginLoad` / `stopPlayback`) or another cycle starts.

Each cycle may emit **at most one** listen event.

`playPrev` seek-0 does **not** go through `onSinkTime`. Treating it as a seek-back on the same cycle would over-count or under-count. Always `onRestart()`.

**Cold-load resume.** After a successful load, `flushPendingResume` may seek to the saved position. That jump does not add to accumulated time (same as any seek). The cycle still starts at successful load. 70% must be accumulated from playing time *after* the resume seek. Finishing from a resume at 80% does not count. `onEnded` does not get a “playhead ≥ 70%” credit. The accumulator has no resume special case. `onSinkTime` currently returns after `flushPendingResume`; call `onTime` either on that same tick before the return, or on a later tick after the seek. Do not add a resume branch.

## Duration

Prefer the track tag duration (seconds). If it is missing or not finite and `> 0`, use sink duration once it is known. If duration is still unknown at `ended`/`eof`, that ended event counts as a listen (the only unknown-duration path). If duration is known and accumulated time is below 70%, `ended` does **not** count.

## Accumulated playing time

While the sink is actually playing, each time sample may add `delta = currentTime - lastCurrentTime` when `0 < delta ≤ 2` seconds. That bound is the seek detector: larger jumps are seeks and add nothing. Seek-back does not subtract. Paused samples update `lastCurrentTime` only.

The first `onTime` of a cycle (no `lastCurrentTime` yet) sets last and adds nothing.

Compare `listenedSec >= 0.7 * duration` using the duration in force at that sample. Crossing the threshold fires immediately (do not wait for ended).

Playback rate does not get a special case: media-time deltas already require 70% of the file.

## Fire contract

`onTime` and `onEnded` return `ListenEvent | null`. `onRestart` returns `null` and resets listened time, last currentTime, and the fired flag for the same `trackId` / profile / playSource.

A discarded / absent cycle: `onTime` / `onEnded` / `onRestart` return `null`.

`durationSec` that is `null`, `NaN`, or `≤ 0` is unknown. Adopt the first finite `duration > 0` from a later `onTime`.

A fire is `{ id, trackId, profile, playSource, countedAt }`:

| Field | Meaning |
|-------|---------|
| `id` | `crypto.randomUUID()` (outbox key and ingest idempotency key) |
| `trackId` | Current track id |
| `profile` | `player.playProfileId` (stream tag, including `source` and exclusive `flac_*`) |
| `playSource` | `streaming` or `downloaded` only; skip the event if the source is anything else |
| `countedAt` | Device ISO-8601 UTC timestamp at the fire moment |

Do not include client id, session id, or listen duration. No UUID fallback.

## What this is not

- Not a diagnostic event. Do not emit through `frontend/src/diag/`.
- Not a stream-request counter.
- Not unique timeline coverage (seek-back can theoretically re-hear the same region; that extra media time still counts toward 70% — accepted).
