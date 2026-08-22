# Stage 03: Living docs

## Status
done

## Description

Replace the written rule that household radio is not stream-vs-download resolve. Document client delivery, unchanged household prepare, clock requirement, remint, and the policy watch. Do not treat `context/design.md` as living documentation.

## Rationale

`docs/systems/playback.md` and `docs/systems/radio.md` currently state radio always loads `/api/stream`. After stages 01–02 that sentence is false and will mislead the next change.

## Invariants

- Living docs describe the shipped client behavior. They do not add product that stages 01–02 did not implement.
- Source of truth for request shapes, `tune_in` fields, and encoder argv stays the code.
- No ADR. These rules belong in the existing system docs.

## Risks

- Partial edits that leave “radio is not stream-vs-download” in one file. Grep the docs tree for that claim before finishing.

## Implementation

### Files

- `docs/systems/radio.md`
- `docs/systems/playback.md`
- `docs/systems/downloads.md`
- `docs/frontend/conventions.md`

### Steps

1. In `docs/systems/radio.md` **Delivery**: keep household prepare / `GET /api/stream` for other tuners. Add that this tuner’s element may load an OPFS blob instead when `resolvePlaySource` + `playbackPolicy` prefer local; `tune_in.codec` is still only a `browser_listed` profile; lossy still uses `source` as the stream tag when streaming. In **Client**: `session.ts` `loadCurrent` owns resolve; socket-up ⇒ `offline: false`; remint + `markTrackBroken`; `radio` watches `playbackPolicy` and re-resolves while `tuning` / `tuned`; `radioPlayState()` reports the real `playSource` / local profile (lossy profile null). In **Guardrails**: radio is not offline (clock required); do not skip `enqueue_prepare` because this tuner has a download; do not import `player.ts` from radio; do not call `resolvePlayIntent` from radio.
2. In `docs/systems/playback.md`, delete or rewrite the paragraph that begins `Household radio is **not** stream-vs-download resolve`. State that radio **does** use `resolvePlaySource` with the same `playbackPolicy`, `offline: false` while the tuner socket is up, seek-to-clock after load, and remint on broken local. Keep queue `canUseRemoteMedia()` rules unchanged and explicitly contrast them. Keep “radio does not write listen-stat events.” Quality-preferences bullet for playback policy should say it applies to queue play **and** radio.
3. In `docs/systems/downloads.md` **Behavior** play-path item and **Ownership** `resolve.ts` row: playback resolution is also used by `radio/session.ts`, not only the on-demand player.
4. In `docs/frontend/conventions.md` playback paragraph: radio `loadCurrent` uses `resolvePlaySource`; radio watches `settings.playbackPolicy` in `stores/radio.ts`; `player.ts` still does not import `radio.ts`.
5. Grep `docs/` for `not` + `stream-vs-download` / `not stream-vs-download` / `always loads \`/api/stream\`` and fix any leftover claim that radio ignores the download policy.

### Verify

```sh
rg -n "stream-vs-download|Household radio is" docs/systems/radio.md docs/systems/playback.md docs/systems/downloads.md docs/frontend/conventions.md
```

Read the edited sections and confirm they match stages 01–02 (socket required, prepare unchanged, `resolvePlaySource` not `resolvePlayIntent`, honest status). No code test run required unless a later edit accidentally touched source.

## Acceptance

- No remaining living-doc sentence claims radio always streams or ignores `playbackPolicy`.
- `docs/systems/radio.md` states: client resolve, clock required, prepare unchanged, remint + mark broken, policy watch, honest `radioPlayState`.
- `docs/systems/playback.md` contrasts radio `offline: false` with queue `canUseRemoteMedia()`.
- `docs/systems/downloads.md` and `docs/frontend/conventions.md` name `radio/session.ts` as a `resolvePlaySource` caller.
