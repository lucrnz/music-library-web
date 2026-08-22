# Stage 01: Play-fail extract

## Status
done

## Description

Introduce `PlayBlockError` and move on-demand load/fail out of `player.ts` so every unavailable or sink failure goes through one writer.

## Rationale

`failCurrentLoad`, `loadResolved` after `attemptPlay`, and sink `onError` each interpret exclusive vs HTML. That forest is what the next playback feature will grow. A typed error plus one module deletes two interpreters.

## Invariants

- `failCurrentLoad` remains the only writer of unavailable play-source face state (source, profile, block, notice, exclusive toast / Settings-open rules).
- Exclusive track-to-track still does not release the companion (`needsCompanionStop` unchanged).
- Broken local blob still remints via `loadResolved(..., { localBroken: true })`.
- `player.ts` still does not import `radio.ts`.
- Listen cycle still starts only after a successful on-demand load.

## Risks

- Changing `SinkHandlers.onError` will miss a call site if radio’s HTML helper is confused with the on-demand sink. Radio audio is a separate element and must stay untouched.

## Implementation

### Files

- frontend/src/playBlock.ts
- frontend/src/playback/load.ts
- frontend/src/stores/player.ts
- frontend/src/playback/sinks/types.ts
- frontend/src/playback/sinks/companionSink.ts
- frontend/src/playback/sinks/htmlAudioSink.ts
- frontend/tests/playback/playBlock.test.ts

### Steps

1. Add `PlayBlockError` on `frontend/src/playBlock.ts`: `reason: PlayBlockReason`, message defaults to `PLAY_BLOCK_MESSAGES[reason]`. Add `toPlayBlockError(err, fallback)` that returns `err` when it is already a `PlayBlockError` and otherwise `new PlayBlockError(fallback, message-from-err)`.
2. Change `SinkHandlers.onError` in `frontend/src/playback/sinks/types.ts` to `(err: PlayBlockError, details?: SinkErrorDetails | null) => void`.
3. In `frontend/src/playback/sinks/htmlAudioSink.ts`, emit `new PlayBlockError("play_failed", "HTML audio playback failed")` from the element error handler. `load()` play rejection throws `PlayBlockError("play_failed")`.
4. In `frontend/src/playback/sinks/companionSink.ts`, throw `PlayBlockError` from the device gate (keep the existing reason). Map companion `error` / `disconnect` events to `PlayBlockError`: use `evt.code` when it is a `PlayBlockReason`, else `exclusive_failed`. Do not pass a raw `code` string into the player.
5. Create `frontend/src/playback/load.ts` with `beginLoad`, `still`, `failCurrentLoad`, `attemptPlay`, `intentForTrack`, `loadResolved` moved from `frontend/src/stores/player.ts` (including listen-cycle start on success and the exclusive missing-tech toast). `attemptPlay` catch uses `toPlayBlockError(err, "play_failed")` and returns `{ ok: false, err }`. On failure, `loadResolved` calls `failCurrentLoad` from `err.reason` / `err.message` only — no `intent.sink` / `activeSink.kind` branch.
6. Leave transport (`playIndex`, next/prev, seek, volume watches, `wireSinkHandlers`, Media Session) in `frontend/src/stores/player.ts`. `wireSinkHandlers.onError` calls `failCurrentLoad` from the `PlayBlockError`. Re-export anything current callers need from `player.ts`.
7. Extend `frontend/tests/playback/playBlock.test.ts` for `PlayBlockError` default message and for `toPlayBlockError`: identity on an existing `PlayBlockError`, wrap of a plain `Error` with the fallback reason.

### Verify

- `pnpm --dir frontend typecheck`
- `pnpm --dir frontend test` (playback + playBlock)

## Acceptance

- `PlayBlockError` exists on `frontend/src/playBlock.ts` and is the sink/load failure type.
- `frontend/src/playback/load.ts` owns `failCurrentLoad` and `loadResolved`.
- `frontend/src/stores/player.ts` has no exclusive-vs-HTML fail branch around `attemptPlay` and no `errorField` scrape of `err.code`.
- `rg "failCurrentLoad" frontend/src` shows the writer in `load.ts` and callers in `player.ts` (wiring) plus `load.ts` itself.
- Radio files under `frontend/src/radio/` are unchanged.
- Typecheck and the playback/playBlock tests listed in Verify pass.
