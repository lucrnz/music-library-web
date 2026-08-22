**Archive.** Decisions in this file were current as of 2026-08-22 (the plan date in the directory name). They may be outdated. Do not treat this as living documentation. This plan directory is an archive.

# Radio stubborn rejoin

## Goal

The radio client stays in the session through official track changes and transient glitches, and keeps joining the official current until audio is actually playing. A track change must not Tune out.

## Settled decisions

- Client only. No server, WebSocket, or prepare-policy changes.
- Chrome may become `stopped` only for: user Tune out, Media Session **stop**, a library/queue play (`become("queue")` → `leaveRadio`), or station **idle**.
- Media Session **pause** and HTML `pause` still mean Tune out, but only while chrome is `tuned`, the element has not `ended`, and load/seek is not in flight. Ignore pause while chrome is `tuning`.
- On official-id change and any reload, chrome drops to `tuning` immediately and stays there until `play()` succeeds (`chrome = "tuned"`). Same face as catch-up / skip-pending.
- While the user still wants to be in the session, retry `sendTuneIn` (socket open) then `loadCurrent` on a 1 s backoff doubling to 8 s. New snapshots that need a load, socket reconnect, and connectivity returning to `online` kick an attempt immediately and reset the delay.
- Each `load` attempt is bounded: radio `canplay` (or error) must settle within 8 s or the attempt fails and the backoff may run. Do not change shared `waitAudioEvent` used by queue play.
- Retryable failures are silent. Drop “Radio could not start — tuned out”, “Could not tune in”, and “Connection lost — tuned out” on those paths. Keep “Radio is not on air yet” when Tune-in hits idle.
- The 3-in-10s failure cap no longer Tunes out. Delete it.
- `skip_pending` and `catching_up` stay in the session (`tuning`, audio stopped, no load until `face === "current"`).
- Listen cycles stay tuned-only: discard when leaving `tuned` or starting a new `loadCurrent`; start only after a successful load → seek → play.

## Design

Today an official advance keeps chrome at `tuned` while the next URL resolves and loads. Any `pause` or `error` in that gap (Safari src-swap after `loadInFlight` drops, `canplay` never arriving, stream not ready) is treated as the user leaving. `onError` also trips a 3-in-10s cap. Failed loads on a track change do not retry. Connectivity loss calls `tuneOut()` and never comes back.

After this plan, “I am a listener” is chrome `tuning` | `tuned` until an allowed Tune-out. Joining audio is a loop, not a one-shot.

```text
allowed Tune-out: user tap | MS stop | MS/HTML pause while tuned | idle | leaveRadio
                            │
official id change / reload / skip_pending / catch-up / connectivity blip / load fail
                            │
                     chrome = tuning
                            │
              kick or 1s → 2s → 4s → 8s…
                            │
              socket open? sendTuneIn
                            │
              face current? load (8s bound) → seek(clock) → play
                            │
                     chrome = tuned
```

`tuneOut()` remains the only function that sends `tune_out` and sets `stopped` (plus `leaveRadio` → `inactive`). Connectivity loss must not call it. Socket close still drops the server tuner; reconnect already exists and must `tune_in` again.

`onFaceOrTrack` is still the snapshot driver for `loadCurrent`. The rejoin clock lives in `stores/radio.ts` (next to `sendTuneIn`, connectivity, and reconnect) and uses a pure helper in `radio/rejoin.ts`. Session code only `schedule`s on load/`error` failure and `cancel`s on success, skip-pending, and catch-up — it does not import the socket runtime. A snapshot-driven `loadCurrent` already in flight is the attempt; do not also `kick`. `radioGen` still cancels overlapping loads.

Pause-as-Tune-out stays a user gesture on a **playing** station. Dropping chrome to `tuning` before any `await` on a swap is what makes the existing `chrome === "tuned"` pause latch safe.

## Stage map

1. **Stay in session** — stop false Tune-outs and drop chrome to `tuning` on a swap. Without this, a retry loop never runs because chrome is already `stopped`.
2. **Rejoin loop** — depends on staying in `tuning` through failures. Adds the backoff clock, bounded radio load, connectivity stay-and-kick, and failed `tune_in` retry.
3. **Living docs** — rewrite the client contract in `docs/systems/radio.md` (and the radio sentences in `docs/systems/playback.md`) against what stages 01–02 actually shipped. `design.md` is not living documentation.

## Out of scope

- Server protocol, tuner registry, prepare, or clock changes
- Exclusive-mode radio
- Auto Tune-in when idle later becomes `current` (idle still leaves the session)
- Making radio pauseable (pause while `tuned` stays Tune-out)
- Rejoin toasts
- Changing queue `waitAudioEvent` or on-demand load failure policy
- Tab-visible as a special rejoin kick (existing `maybeReseek` while `tuned` stays)

## Assumptions

- An official advance is `current` → `current` with a new id. `skip_pending` is only for a missing/unresolvable current, not a normal tick.
- Some browsers fire `pause` (and sometimes `error`) after `load()` has cleared `loadInFlight`, while chrome is still `tuned`.
- Shared `waitAudioEvent` can wait forever if neither `canplay` nor `error` fires; radio must bound that wait itself.
- WebSocket close already removes this tuner on the server, so a rejoin after reconnect must send `tune_in`.
- Re-sending `tune_in` with the same Streaming profile on an open socket is safe (same path as a codec change, without changing the profile).
