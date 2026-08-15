> **Archive.** Decisions in this file were current as of 2026-08-15 (the plan date in the directory name). They may be outdated. Do not treat this as living documentation. This plan directory is an archive.

# Playback and exclusive correctness

## Goal

Make the six user-facing high-impact playback and exclusive bugs match the behavior the product already claims, **by deleting the shapes that caused them** — not by sprinkling flags onto `playIndex` and `syncCompanionConnection`.

## Settled decisions

- **Scope:** the six bugs only (exclusive reconnect, overlapping `playIndex`, HTML `stop()` `error`, Play after reload, remove-current stops, `server_down` skips local). Out of scope unchanged: stream-cache identity, scan/FTS/cover/symlink, seek latch, search debounce, exclusive toggle mid-play, stream-fail → local, resume-from-saved-position.
- **Plan artifact:** rewrite this 018 directory in place. No 019.
- **HTML sink:** `onError` only when the content attribute is set (`audio.getAttribute("src")`). Do not AND with `currentSrc` (it lags; a real error can also fire before it is set). No `tearingDown` flag. A lagged `currentSrc` is this predicate failing, not proof a flag is required.
- **Player load isolation:** one generation token (`playGen`) with `beginLoad` / `still(gen)` / `invalidateLoads()`. **No `sinkLoadGen`.** File-local `playExclusive` / `playHtml` in `player.js`. **No new module.** `playIndex` is a thin dispatcher.
- **Stale sink events:** `beginLoad` / `stopPlayback` clear play-source **then** stop. `beginLoad` always `htmlSink.stop()` (stage 01 eats the empty-src `error`). Do **not** `MSG_STOP` companion at `beginLoad` (exclusive keeps playing through `ensurePreferredDevice`). `onEnded` no-ops when `playSource === "none"`. Load-failure / disconnect / `controller_lost` `onError` no-ops when `playSource === "none"`. `exclusive_needs_device` toasts and opens Settings only when idle (`pl.index < 0`); during an in-flight load (`index >= 0`, source still `none`) it no-ops — `ensurePreferredDevice` is the only reporter.
- **Companion current load:** `companionSink` has `hasLoad`. Set only if `companionLoad` actually sends; clear in `stop()` (then `MSG_STOP`, even if already false). `eof` / `error` / `disconnect` emit only while `hasLoad`. `time` / `pause` still update sink clocks. Exclusive→exclusive without a beginLoad STOP leaves `hasLoad` true; the `none` guards cover that window.
- **Play after reload:** one `ensureAudible()` used by `togglePlay` (when paused) and Media Session `"play"`. No queue → return; `index < 0` → `playIndex(0)`; `playSource` not `streaming` / `downloaded` → `playIndex(pl.index)`; else `resume()`. Start at 0. Do not persist `currentTime`. `unavailable` retries via `playIndex` (Play means try again).
- **Reachability:** `canReachServer()` is the only play/prepare/cover-remote gate in `player.js`. Delete `isHardOffline()` pairs there. Cover/prepare pairs are already equivalent to `canReachServer()` — the behavior change is `resolvePlaySource({ offline: !canReachServer() })` and no stream fallback from a broken local blob while unreachable. No stream-fail → local while reachable.
- **Exclusive hub:** `handle_disconnect(sess)` and `handle_message(sess, …)` no-op unless `sess is _clients[session_id]`. Hello-replace of the same `session_id` **keeps** the controller claim (if free or already this id, new socket is controller). Do **not** set `_controller_id = None` on replace. Close the displaced websocket **outside** the hub lock. That close must not release hog.
- **Exclusive client:** `onclose` only if `event.target === ws`. Desired key = port + trimmed token. `inFlightKey` set only in `connectNow`, cleared in `disconnectCompanion`. Same key + `OPEN`/`CONNECTING` → no-op. Different key → `intentionalClose`, `close()`, `connectNow` assigns a new `WebSocket` to `ws`. **No debounce timer.** `setHogToken` persists; empty token disconnects immediately; `commitHogToken()` syncs (panel `@change`). Port and enable stay immediate.
- **Remove current:** delete `index = -1`. Splice + existing clamp. Matches plan 017.
- **Docs:** thin `playback.md` clarification. Do not rewrite `exclusive-audio.md`.
- **Tests:** extend `tests/test_exclusive_hub_release.py`. No JS harness.

## Design

Three seams, then the queue one-liner and the doc line.

**Sink honesty.** HTML `error` after `removeAttribute("src")` is not a failed play. Gate the listener on the content attribute. Companion `eof` / `error` / `disconnect` are not a failed play after `stop()`. `beginLoad` stops HTML so the next load’s await window is empty-src; it does not `MSG_STOP` companion (that would punch a hole through `ensurePreferredDevice`).

**Load session (browser player).** `playIndex` today is two programs and five awaits. A counter after each await preserves that. Instead: `beginLoad()` increments `playGen`, clears play-source, stops HTML; `stopPlayback` invalidates, clears, then stops. `playExclusive` / `playHtml` return when `!still(gen)`. Shared `onError` / `onEnded` use `playSource === "none"` (and idle `index` for device-missing), not a second token — `still(playGen)` in a once-wired handler is a tautology. `ensureAudible()` is the only Play/Media-Session play path. Resolve, near-end prepare, and remote covers ask `canReachServer()` once.

**Exclusive reconnect.** The hub bug is identity: disconnect and `handle_message` must name the session object. Same `session_id` keeps the controller claim so replace does not look like controller loss. Close the old socket after replace so its `finally` is a no-op and the displaced receive loop dies. The client bug is “always tear down to sync.” Same-key no-op; persist token keystrokes; `commitHogToken` on `@change`; ignore stale `onclose`. No timer.

Stage 02 owns the player-load extract (generation, none-guards, companion `hasLoad`, Play-ensure, reachability). Splitting those across stages was how the first draft would have stuffed `player.js` three times.

## Stage map

1. **HTML empty-src errors** — sink-local; `onError` becomes trustworthy.
2. **Player load isolation** — extract + none-guards + companion `hasLoad` + `ensureAudible` + `canReachServer()` unify. Depends on 01 so `htmlSink.stop()` during extract is quiet.
3. **Hub disconnect identity** — companion process; identity on disconnect and `handle_message`; same-id keeps controller; pytest; mandatory old-socket close.
4. **Client idempotent sync** — stale `onclose` + `inFlightKey` + `commitHogToken`. Pairs with 03.
5. **Remove-current continues** — independent queue cursor.
6. **playback.md** — records the stage 02 reachability invariant.

## Out of scope

- Process-temp stream cache keyed only by path.
- Duplicate PCM / unique fingerprint identity.
- Quick-scan FTS not deleting missing rows.
- `/api/cover?album_id=` path jail.
- Outbound file symlink crashing scan or browse.
- Seek-bar `seeking` latch; search debounce after unmount.
- Toggling exclusive mid-play without `playIndex`.
- Stream `load()` failure falling back to OPFS while `canReachServer()`.
- Persisting or restoring playback position across reload.
- New `playback/playLoad.js` (or similar) this plan — extract stays in `player.js`.
- Gating companion `time` / `pause` on `hasLoad`.

## Assumptions

- Frontend verification is manual (`uv run musicweb`); no JS test runner.
- Exclusive hub tests keep the fake player / fake websocket in `tests/test_exclusive_hub_release.py`.
- Position is not in `musicweb.playlist.v1`; Play after reload starting at 0 is correct.
- `canReachServer()` is `state === "online" && !browserOffline()` and is the right single gate.
- Extracting loaders into a new file that imports `player.js` would cycle; file-local functions are the judo that actually deletes branches.
- `playSource === "none"` after `beginLoad` / `stopPlayback` is the right “no current load” signal for once-wired sink handlers. A second generation token on that handler is the shape this plan deletes.
