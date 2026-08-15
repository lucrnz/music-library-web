# Stage 05: Player seam emits

## Status
done

## Description

Move client playback catalog emits onto `beginLoad`/`playIndex`, `applyResolvedSource`, `failPlayback`, `attemptPlay`, and a single `player.load.ok` after the last successful HTML `attemptPlay`. Remove the copy-pasted emits from the `playHtml` fallback tree. Exclusive hard-stop stays on `failPlayback` → `player.load.fail`.

## Rationale

Catalog names in the middle of `playHtml` are how the file approaches 1k and how exclusive accidentally grew a second fail story. The seams already know the outcome.

## Invariants

- Empty-src HTML `error` still unlogged; `playSource === "none"` still no-ops before `sink.html.error`.
- No `timeupdate` / `onTime` emits.
- Exclusive success does **not** emit `player.load.ok`.
- `failPlayback` emits **only** `player.load.fail` (not `player.unavailable`).
- `applyResolvedSource` emits `player.unavailable` (`error`) on unavailable, `player.resolve` (`info`) otherwise.
- `player.load.begin` still once per `playIndex`, after `beginLoad`/`beginPlay` so `play_id` is set.
- Callsites still do not read `getMode()` / `diag.mode`.

## Risks

- `applyResolvedSource` is also used if exclusive apply runs — Everything will gain an info `player.resolve` on exclusive loads. Accept (info, cutoff-quiet).
- `failPlayback` used by exclusive will write `player.load.fail`. That is the settled exclusive decision, not a regression.

## Implementation

### Files

- Change `src/musicweb/static/js/stores/player.js`
- Do **not** add `static/js/diag/player.js`

### Steps

1. `failPlayback`: keep state writes; emit only `player.load.fail` with `failCtx({ reason, message })`. Delete the second `player.unavailable` emit.
2. `applyResolvedSource`: after `setPlaySourceState`, emit unavailable or resolve as above. Delete the matching emits from `playHtml`.
3. `playHtml`: after all fallbacks, if `still(gen)` and `result.ok`, emit `player.load.ok` **once**. Delete the two inner `load.ok` blocks.
4. Keep `attemptPlay` HTML `play_reject`. Keep `onError` `sink.html.error` after the none-guard (not exclusive).
5. Keep `player.load.begin` in `playIndex` only.
6. `failCtx` stays file-local. Net line count in `player.js` must not grow vs HEAD at plan start (expect a drop).

### Verify

- `rg "player.load.ok" src/musicweb/static/js/stores/player.js` — one emit.
- `rg "player.unavailable" src/musicweb/static/js/stores/player.js` — only inside `applyResolvedSource`.
- `rg "player.load.fail" src/musicweb/static/js/stores/player.js` — only inside `failPlayback`.
- `rg "playerDiag|diag/player" src/musicweb/static/js` — no matches.
- `wc -l src/musicweb/static/js/stores/player.js` — &lt; 1000 and ≤ current 895.
- Manual Everything: HTML play → begin, resolve, ok, same `play_id`. Fail stream → `load.fail` without a second `unavailable`. Resolve-blocked (offline, no download) → `unavailable` without `load.fail`.

## Acceptance

- [ ] `playHtml` has no catalog emit names except the final `load.ok`.
- [ ] Exclusive hard-stop produces `player.load.fail` via `failPlayback`.
- [ ] `player.js` did not grow and did not gain a new module.
