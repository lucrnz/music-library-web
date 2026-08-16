# Stage 01: HTML sink reports error only when it has a src

## Status
done

## Description

`htmlAudioSink` `error` must not call `onError` when the element has no src content attribute. `stop()` stays pause + drop src + `load()`. No teardown flag.

## Rationale

The delayed empty-src `error` is what makes `selectSink("companion")` / `stopPlayback` look like a failed play (and can `hardStopCompanion`). Gate the listener on the content attribute. `currentSrc` lags until `load()` finishes, and a real decode/network failure can fire before it is set — ANDing it in either swallows teardown too late or swallows real errors. A `tearingDown` boolean is a second mechanism for “has src.”

## Invariants

- `HTMLAudioElement` stays private to the sink.
- Real decode / network failures while a src attribute is set still call `onError`.
- `stop()` still leaves the element clean for the next `load()`.

## Risks

- AND-with-`currentSrc` is the failure mode (teardown `error` while `currentSrc` still holds the old URL). Do not treat that as proof a flag is required — drop the conjunct. Verify Clear-all and HTML→exclusive in Chromium against `getAttribute("src")` only.

## Implementation

### Files

- Change `src/musicweb/static/js/playback/sinks/htmlAudioSink.js`
- Do **not** change `player.js` in this stage.

### Steps

1. In the `error` listener: if `!audio.getAttribute("src")`, return. Otherwise `handlers.onError?.("HTML audio playback failed")`. Do not consult `audio.src` (IDL) or `audio.currentSrc`.
2. Leave `stop()` as pause / removeAttribute / `load()`. Do not add `tearingDown`.

### Verify

- `uv run --group dev pytest`
- `uv run musicweb`:
  - Play a track, Clear all. Status must not become “HTML audio playback failed.”
  - Play over HTML, enable exclusive, start a track. Exclusive must not immediately hard-stop from the HTML `error`.

## Acceptance

- [x] Empty-src `error` (no content attribute) does not call `onError`.
- [x] A bad stream URL still reports `onError`.
- [x] No teardown flag.
- [x] `player.js` unchanged.
