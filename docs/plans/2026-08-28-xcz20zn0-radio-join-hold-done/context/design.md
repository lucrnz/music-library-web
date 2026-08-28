**Archive.** Decisions in this file were current as of 2026-08-28 (the plan date in the directory name). They may be outdated. Do not treat this as living documentation. This plan directory is an archive.

# Radio join hold

## Goal

A radio join is not done when `play()` resolves. It is done after 8 seconds of uninterrupted playback. A sub-second play-then-stop must stay in session and retry, so the listener does not have to tap Tune in again.

## Settled decisions

- Client only. No server, WebSocket, prepare, or chrome-enum changes.
- Every join uses the hold: official song-swap, first Tune in, socket reconnect, connectivity recovery, and Streaming / exclusive / download-policy reloads.
- Hold length is **8.0 seconds** wall-clock (`RADIO_JOIN_HOLD_MS`).
- Success is `play()` resolved and the element stays not paused, not ended, and without error for those 8 s. Do not require `currentTime` to advance.
- Pause, error, or unexpected stop during the hold is a failed join: chrome `tuning`, `schedule` the existing 1 s → 8 s rejoin. Do not `kick`. Do not Tune out.
- Official `ended` during the hold is success for that join (cancel the hold, do not retry that load). The station clock still owns the next track.
- Chrome becomes `tuned` as soon as load → seek → `play()` succeeds, so Tune out and the status line work during the hold. The hold is a provisional latch on pause, not a new chrome value.
- HTML `pause` and Media Session **pause** during the hold retry. After the hold completes, those pauses Tune out again.
- Always leave immediately: Tune-out tap, Media Session **stop**, library/queue play (`leaveRadio`), station idle.
- Listen cycles still start after successful load → seek → `play()` (when chrome becomes `tuned`). A failed hold discards via the next `loadCurrent` / `clearLoadedKeys`.
- Allowed Tune-outs from the stubborn-rejoin contract stay: user Tune out, Media Session **stop**, pause while `tuned` **and** the hold is not pending, idle, `leaveRadio`.

## Design

Today `loadCurrent` sets `chrome = "tuned"` and `cancelRadioRejoin()` as soon as `play()` resolves. HTML and Media Session `pause` while `tuned` (and not `ended`) call `tuneOut()`. Some joins play for a fraction of a second, then fire `pause` (stale src-swap, stream not actually ready, companion blip). Chrome becomes `stopped`. The rejoin loop never runs because the user is no longer in session.

```text
load → seek → play()
        │
        ▼
 chrome = tuned          status line + Tune out work
 start 8s join hold
        │
        ├─ pause / error / unexpected stop
        │     chrome = tuning
        │     schedule 1s → 2s → 4s → 8s
        │
        ├─ official ended
        │     cancel hold (this join is done)
        │
        ├─ Tune out / MS stop / idle / leaveRadio
        │     cancel hold, leave
        │
        └─ 8s still playing
              hold complete
              pause is Tune-out again
```

The hold clock is a second timer from the rejoin backoff. `play()` success still `cancel`s the backoff (that attempt finished). The hold then watches whether the attempt *sticks*. A failed hold `schedule`s; because success already reset `lastDelay`, the first retry is 1 s.

One module-level `createJoinHold()` lives in `session.ts` next to `radioGen`. `pending` is the only latch the pause handlers read. `start()` after the existing `chrome = "tuned"` line. `cancel()` is idempotent and runs whenever this play is no longer the live join. `tuneOut`, `leaveRadio`, and `resetRadioStore` must `cancel()` **before** `audio.stop()`: `stopHtmlAudio` calls `pause()`, and a still-pending hold would treat that as a failed join and `schedule` rejoin.

HTML `onPause` and Media Session `pause` share one function: if chrome is not `tuned` or the element `ended`, ignore; if `joinHold.pending`, fail the join (`tuning` + `scheduleRadioRejoin()`); else `tuneOut()`. `shouldIgnorePause` (load/seek/ended) still drops the event before that function.

## Stage map

1. **Hold clock** — a testable 8 s pending latch with no session imports. Stage 02 cannot wire pause-vs-Tune-out without this primitive.
2. **Wire the hold** — depends on 01. Starts the latch after `play()`, makes pause during the hold retry, cancels on every teardown. This is the user-visible fix.
3. **Living docs** — rewrite the client pause/join sentences in `docs/systems/radio.md` (and the radio paragraph in `docs/systems/playback.md`) against what 01–02 shipped. `design.md` is not living documentation.

## Out of scope

- Server protocol, tuner registry, prepare, or clock changes
- A new chrome value (`confirming`, etc.)
- Making radio pauseable after the hold
- Rejoin toasts
- Changing the 1 s → 8 s backoff, the 8 s `canplay` load bound, or queue `waitAudioEvent`
- Requiring `currentTime` to advance
- Auto Tune-in when idle later becomes `current`
- Tab-visible as a special hold or rejoin kick

## Assumptions

- The sub-second stop is a `pause` (or `error`) after `play()` resolved, not a Tune-out tap.
- Companion radio uses the same `onPause` / `onError` / `onEnded` hooks as HTML, so one hold covers exclusive.
- Tracks are eligible at ≥ 30 s; official song-swap therefore has enough remaining time for an 8 s hold. Mid-song reconnects that `ended` before 8 s are handled by the ended-is-success rule.
- `play()` success already `cancel`s the rejoin clock; a later failed hold must `schedule` itself.
- Room/compact Tune out stays enabled while `tuned`, including during the hold.
