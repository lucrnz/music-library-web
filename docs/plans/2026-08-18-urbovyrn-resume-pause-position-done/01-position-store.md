# Stage 01: Position store

## Status
done

## Description

Add a pure module for the playback-position `localStorage` slot: schema, read/write/clear, and `resumeSeconds` (id match + 3s near-end clamp). No player wiring.

## Rationale

`player.ts` is off-limits to the frontend test harness. Persist policy has to live in a module tests can import, or the clamp and match rules will only exist as comments.

## Invariants

- Key is `musicweb.playbackPosition.v1`.
- Value is JSON `{ trackId: string, seconds: number }`. `seconds` must be finite and `>= 0`.
- Read returns `null` on missing key, thrown storage, bad JSON, or invalid shape. Never throw to callers.
- Write no-ops on empty `trackId`, non-finite / negative seconds, or thrown storage (same ignore-quota pattern as `playerPrefs`).
- `resumeSeconds` returns `null` when `saved` is null or `saved.trackId !== trackId`. Returns `0` when `duration` is a finite `> 0` and `saved.seconds >= duration - 3` (includes `>= duration`). Otherwise returns `saved.seconds` (do not clamp a missing duration).
- Near-end window is exactly 3 seconds, exported as a named constant (same number `playPrev` uses).
- The module does not import `player.ts`, sinks, Vue, or `@/api`.
- Tests do not import `player.ts`.

## Risks

- Writing `0` and treating “no save” as `null` must stay distinct: a pause at 0:00 should restore 0, not “no position.” `resumeSeconds` returns `0` in that case, not `null`.

## Implementation

### Files

- Create: `frontend/src/stores/playbackPosition.ts`
- Create: `frontend/tests/stores/playbackPosition.test.ts`

### Steps

1. Export `PLAYBACK_POSITION_KEY`, `NEAR_END_SECONDS = 3`, `PlaybackPosition` type, `readPlaybackPosition`, `writePlaybackPosition`, `clearPlaybackPosition`, and `resumeSeconds`.
2. `readPlaybackPosition`: `JSON.parse` the key; require `typeof trackId === "string" && trackId.length > 0` and `typeof seconds === "number" && Number.isFinite(seconds) && seconds >= 0`; else `null`.
3. `writePlaybackPosition(trackId, seconds)`: `setItem` the JSON object. `clearPlaybackPosition`: `removeItem`.
4. `resumeSeconds({ trackId, saved, duration })`: implement the match / near-end rules in Invariants. Default `saved` is not auto-read; callers pass `readPlaybackPosition()` so tests stay storage-free for the pure function.
5. Node tests (Map-backed `localStorage` already in `frontend/tests/setup-node.ts`):
   - write → read round trip
   - clear → read `null`
   - read invalid JSON / missing fields / negative seconds → `null`
   - `resumeSeconds`: match, mismatch, null saved, pause at `0` returns `0`, `duration - 2.9` → `0`, `duration` exactly → `0`, `duration - 3.1` → that seconds, unknown duration → saved seconds unchanged

### Verify

```sh
pnpm --dir frontend typecheck
pnpm --dir frontend test
```

## Acceptance

- [ ] Key, shape, and near-end constant match Invariants.
- [ ] `resumeSeconds` is covered for match, mismatch, `0`, near-end, and missing duration.
- [ ] Neither the module nor its test imports `player.ts`.
