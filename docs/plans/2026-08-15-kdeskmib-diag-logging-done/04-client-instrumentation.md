# Stage 04: Client playback-path callsites

## Status
done

## Description

Emit the client events in [event-catalog.md](./context/event-catalog.md) from player load/resolve/fail, the HTML sink (after existing guards), connectivity transitions, PWA registration, and one codec-probe summary.

## Rationale

Without these callsites the outbox is empty during an Android repro. This is the half of the timeline you cannot get from stdout.

## Invariants

- Empty-src HTML `error` stays unlogged (`htmlAudioSink` already returns early). `playSource === "none"` `onError` stays a no-op and does not emit `sink.html.error`.
- No `timeupdate` / `onTime` / `onDuration` / `onPauseState` events.
- Companion / exclusive `onError` paths do not gain new events this plan.
- `console.*` in player/connectivity/pwa stay; they are not redirected.
- `beginPlay()` runs inside `beginLoad` so every `playIndex` has a `play_id` before resolve.
- Callsites pass the catalog level and a failure context on every `error` emit. They do not read `getMode()`.

## Risks

- Emitting inside `beginLoad` before `htmlSink.stop()` could order `player.load.begin` ahead of a leftover error; the none-guard still drops that error. Keep emit after `playGen` increments, still no-op empty-src.
- `codec.probe.summary` must be once per `loadCodecs` success, not once per fixture.

## Implementation

### Files

- Change `src/musicweb/static/js/stores/player.js`
- Change `src/musicweb/static/js/playback/sinks/htmlAudioSink.js`
- Change `src/musicweb/static/js/playback/sinks/types.js` (optional details arg on `onError`)
- Change `src/musicweb/static/js/connectivity.js`
- Change `src/musicweb/static/js/pwa.js`
- Change `src/musicweb/static/js/stores/settings.js` (`loadCodecs` summary only)

### Steps

1. `beginLoad`: `const playId = beginPlay()` then emit `player.load.begin` with `track_id`/`index` from `playIndex` (emit in `playIndex` after `beginLoad` if index/track are not known yet — **one** begin event, not both).
2. After `resolvePlaySource`: `player.resolve` at `info` only when the result is not unavailable. On `unavailable`: `player.unavailable` at `error` with failure context (do not also emit an info `player.resolve`). After successful `attemptPlay`: `player.load.ok` at `info`. On `{ok:false}` or `failPlayback`: `player.load.fail` at `error` with failure context.
3. `htmlAudioSink` `error` handler: after the empty-src guard, pass `media.error.code`, `networkState`, `readyState` to `onError`. Player emits `sink.html.error` at `error` only when it does not return on `playSource === "none"` and the sink is HTML.
4. `attemptPlay` catch / `load` throw: emit `sink.html.play_reject` at `error` with `err.name` + message + failure context, then existing fail path.
5. `connectivity.setState`: emit `connectivity.state` at `info` with `from`/`to` after the change.
6. `pwa.js` `doRegister`: emit `pwa.sw` on every terminal result. Level `error` only when `result=error`; otherwise `info`.
7. `loadCodecs`: after `filterCodecsByDecodeSupport`, emit `codec.probe.summary` at `info` with catalog ids vs kept ids. On fetch failure, skip the summary (existing `console.error` remains).
8. Failure context helper (player-local or `diag/log.js`): `track_id`, `play_source`, `profile`, `reason`, `connectivity` from current stores — used by every client `error` emit in this stage.

### Verify

- `rg "timeupdate|onTime" src/musicweb/static/js/diag src/musicweb/static/js/stores/player.js` — no new `emit(` tied to time.
- `rg "beginPlay|player.load.begin" src/musicweb/static/js/stores/player.js`
- Manual desktop, **Errors only**: fail a stream. JSONL has `player.load.fail` and/or `sink.html.*` with failure context; **no** `player.load.begin` / `player.resolve` / `player.load.ok`.
- Manual, **Everything**: same play shows begin → resolve → ok or fail, same `play_id` and a `session_id`.
- Manual: toggle airplane mode (or DevTools offline) on Everything → `connectivity.state` lines; on Errors only → no connectivity lines; no flood either way.

## Acceptance

- [x] All client catalog events can be produced by the corresponding user action; levels match the catalog.
- [x] Errors only persists only `error` lines; those lines include failure context.
- [x] Empty-src stop and `playSource === "none"` errors add zero `sink.html.error` lines.
- [x] Exclusive/companion code paths compile and behave as today (no new exclusive events).
