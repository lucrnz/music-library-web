# Stage 02: Player load isolation

## Status
done

## Description

Replace the branching `playIndex` body with a load session plus two file-local loaders. Shared sink handlers no-op when there is no current load. Companion emits ended/error only while `hasLoad`. Play / Media Session play go through `ensureAudible()`. `canReachServer()` is the only reachability gate in `player.js`.

## Rationale

Overlapping `playIndex`, Play-after-reload, and `server_down` are the same missing model: one current load, one way to start it, one way to know the server is usable. A `sinkLoadGen` on the once-wired `onError` is a teardown flag — `still(playGen)` there is a tautology, and that handler also sees device-missing / disconnect / TTL. Abort HTML at `beginLoad` (stage 01) and treat `playSource === "none"` as “no load.” Do not `MSG_STOP` companion at `beginLoad`: `ensurePreferredDevice` can take ~1.5s.

`companionSink` still forwards `eof` / `error` / `disconnect` for process lifetime. After `selectSink("htmlAudio")` that is a ghost `hardStop`. `hasLoad` is sink honesty for companion, same family as stage 01.

## Invariants

- Atomic `setPlaySourceState` / `failPlayback` remain the only writers of the play-source triple.
- Exclusive still has no HTML/OPFS fallback.
- Repeat-one and near-end prepare latch unchanged when `playSource` is not `none`.
- Stage 01 empty-src silence remains; this stage does not re-handle HTML teardown in `player.js`.
- `HTMLAudioElement` still not exported.
- No new JS module for loaders (file-local only).
- No `sinkLoadGen` / `tearingDown` / second generation token.

## Risks

- Incrementing the token after the first `await` leaves a stale-win window. `beginLoad()` is the first side effect of `playIndex` (before `selectSink`, `revokeLocalPlayUrl`, any `await`).
- Stopping companion at `beginLoad` would silence exclusive for the device gate. Do not.
- Exclusive→exclusive leaves `hasLoad` true during the gate. `onEnded` / load-failure `onError` must see `playSource === "none"` or the old track’s eof calls `playNext`.
- Clear play-source **before** sink `stop()`. Today’s stop-then-clear can emit while source is still `streaming`.
- Retrying `unavailable` on Play can reopen Settings on exclusive device-missing. Acceptable: Play means try again.
- Do not invent `playback/playLoad.js`. A store import cycle is worse than a long file with two named functions.

## Implementation

### Files

- Change `src/musicweb/static/js/stores/player.js`
- Change `src/musicweb/static/js/playback/sinks/companionSink.js`
- Do **not** add a new playback module.

### Steps

1. **`companionSink` `hasLoad`:**
   - `load(url)`: `hasLoad = companionLoad(url)`; if `!hasLoad`, throw as today.
   - `stop()`: `hasLoad = false`, then `companionStop()` (even if it was already false).
   - Listener: `eof` / `error` / `disconnect` call handlers only if `hasLoad`. `time` / `pause` unchanged.

2. **Load session** (one token):
   - `let playGen = 0`
   - `beginLoad()` → `++playGen`; `clearPlaySourceState()`; `htmlSink.stop()`; return the gen.
   - `still(gen)` → `gen === playGen`
   - `invalidateLoads()` → `++playGen`
   - Do **not** stop `companionSink` / `activeSink` here.

3. **`playIndex`** becomes: bounds check; `const gen = beginLoad()`; set index / shuffle / commit / reset near-end + covers / revoke blob / clear notice; then `return isExclusiveEnabled() ? playExclusive(gen, track) : playHtml(gen, track)`.

4. **`playExclusive(gen, track)`** / **`playHtml(gen, track)`**: move the existing exclusive and HTML bodies here. After every `await`, `if (!still(gen)) return`. Do not `failPlayback` / `hardStopCompanion` / `setPlayNotice` when `!still(gen)`.

5. **`attemptPlay(url, gen)`**: if `!still(gen)`, return stale without loading. Otherwise the existing `load()`. Do not record a sink gen.

6. **`onEnded`:** if `player.playSource === "none"`, return. Else existing repeat-one / `playNext`.

7. **`onError`:**
   - `exclusive_needs_device`: if `playSource === "none"` and `pl.index < 0` → toast + `openSettings()`, return. If `playSource === "none"` and `pl.index >= 0` → return (`ensurePreferredDevice` reports). Else existing hard-stop-if-active-companion-or-source path.
   - Anything else (HTML failure, disconnect, `controller_lost`, companion error): if `playSource === "none"`, return. Else existing exclusive / HTML branches.

8. **`stopPlayback`:** `invalidateLoads()`; `clearPlaySourceState()`; then `activeSink.stop()`; if `activeSink !== htmlSink`, `htmlSink.stop()` as well. Then the rest (revoke, notice, covers, `pl.index = -1`, …) as today.

9. **`ensureAudible()`:** if `!pl.length`, return; if `pl.index < 0`, `playIndex(0)`; else if `playSource` is not `"streaming"` and not `"downloaded"`, `playIndex(pl.index)`; else `resume()`. `togglePlay`: no queue / `index < 0` as today; if paused → `ensureAudible()`; else pause. Media Session `"play"` → `ensureAudible()`. No boot autoplay. No position persistence.

10. **Reachability:** `resolvePlaySource({ offline: !canReachServer() })`. Local-blob failure must not stream when `!canReachServer()`. Cover `allowRemote` and `maybePrepareNext` already match `canReachServer()` (the `isHardOffline()` pairs are redundant) — replace them with that single call. Remove `isHardOffline` from this file if it has no remaining uses. Do not rewrite other reachability.

### Verify

- `uv run --group dev pytest`
- `uv run musicweb`:
  - Mash Next / click another queue row while a load is resolving. Last click wins; no “playback failed” on the winner.
  - Play exclusive, mash Next: current track keeps playing until the new load; no 1.5s hole; last click wins.
  - Play HTML, Clear all: status must not become “HTML audio playback failed” or exclusive-failed; no `playNext`.
  - Exclusive connected, Clear all, then companion disconnect: player stays idle (`none`), no toast / `unavailable`.
  - Exclusive device-missing while idle (`index < 0`): toast + Settings. Same event during an in-flight exclusive load: no extra toast (gate reports).
  - Refresh mid-queue. Play (and Media Session play if available) starts `pl.index` from 0. Later Pause/Play toggles. No boot autoplay.
  - Downloads on, prefer-stream, track downloaded. Stop the server. Play that track from OPFS, not `play_failed`. Server up: prefer-stream still streams.
  - `player.js` has `playExclusive` / `playHtml` / `still` / `ensureAudible`; no `sinkLoadGen`. `companionSink` has `hasLoad`. No new import file for this.

## Acceptance

- [x] `playIndex` dispatches; exclusive and HTML loads are separate functions using `still(gen)`.
- [x] Stale awaits cannot write play-source for a superseded load.
- [x] No `sinkLoadGen`. `onEnded` / load-failure `onError` no-op when `playSource === "none"`.
- [x] `exclusive_needs_device` toasts only when idle (`index < 0`).
- [x] `beginLoad` stops HTML only; exclusive is not `MSG_STOP`’d at load start.
- [x] `companionSink` emits `eof` / `error` / `disconnect` only while `hasLoad`.
- [x] `stopPlayback` invalidates, clears source, then stops.
- [x] Play with no active load (`none` or `unavailable`) calls `playIndex` via `ensureAudible`; an active load only resumes.
- [x] `canReachServer()` is the only reachability predicate in `player.js`.
- [x] No new JS module.
