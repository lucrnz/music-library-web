# Stage 06: Living docs

## Status
done

## Description

Write the shipped exclusive-radio contract into living docs. Remove the exclusive-radio TODO. Fix the leftover-OPFS contradiction on the exclusive-audio page. `context/design.md` is not living documentation.

## Rationale

Agents will keep shipping HTML-only radio if the systems pages still say exclusive radio is out of scope.

## Invariants

- Docs state intent and ownership, not WS payloads or exact prepare argv.
- Exclusive radio: this Mac loads companion (locker / exclusive FLAC tag / lossy `source`) and seeks the household clock. `tune_in` stays browser-listed. Household prepare is unchanged.
- Exclusive-lossy: AS IS (`source` or locker); no FLAC remux; details are source-format rows; prepare does not POST `source`.
- Leftover OPFS is HTML-only and is **not** loaded into mpv (stream instead). Remove the sentence that says exclusive may load leftover into mpv.
- `context/design.md` is not linked as living documentation.

## Risks

- Copying stage implementation into docs will rot. Keep “radio exclusive uses exclusiveDelivery + radio companion backend; do not call resolvePlayIntent.”

## Implementation

### Files

- `docs/systems/exclusive-audio.md`
- `docs/systems/radio.md`
- `docs/systems/playback.md`
- `docs/product/core-guidelines.md`
- `docs/frontend/conventions.md`

### Steps

1. In `docs/systems/exclusive-audio.md`: delete **Exclusive-mode radio is TODO** / “Tune-in stops the hog; radio audio is HTML-only”. Say Tune-in keeps hog armed (`stop` is transport-only) and radio uses the companion sink path (locker / exclusive tag / lossy `source`) with clock seek. Unarmed exclusive Tune-in hard-fails (no HTML). Fix leftover OPFS: HTML-only, never mpv (align the “Armed” table with the architecture bullet). Exclusive-on now-playing face applies to radio as well as queue.
2. In `docs/systems/radio.md`: remove exclusive-radio from Out of scope. Delivery: exclusive enabled → `exclusiveDelivery` + companion `radioAudio` backend; exclusive off → today’s HTML `resolvePlaySource`. Guardrail stays: do not call `resolvePlayIntent` / do not import `player.ts`. `tune_in.codec` stays `browser_listed`. This tuner may `requestPrepare` the current exclusive tag only. Status: exclusive snap is not ignored when exclusive is enabled. Note `maybeReseek` uses `radioAudio` getters, not `el`.
3. In `docs/systems/playback.md`: exclusive radio is companion delivery + clock seek; leaving queue still `companionStop` (no unhog); exclusive face/details apply when `session` is queue or radio. Exclusive-lossy details and no missing-tech toast / no prepare `source` belong here in one sentence each.
4. In `docs/product/core-guidelines.md` Radio tab bullet: exclusive-mode radio is supported on the Mac PWA hog (not HTML-only). Lossy still play as stored.
5. In `docs/frontend/conventions.md`: radio audio backend is HTML or companion; `exclusiveDelivery` is shared; `resolvePlayIntent` remains queue-only; exclusive status gates include radio; `initRadioListeners` also watches exclusive enabled / format mode / device preference.

### Verify

```sh
# no automated doc tests — read the pages named in Files
```

Confirm no remaining “exclusive-mode radio is TODO” / “radio stays HTML-only until a future design” on those pages. Confirm leftover-into-mpv is gone.

## Acceptance

- A reader can see that exclusive radio plays through mpv on the clock, that `tune_in` is still a browser codec, and that lossy exclusive is `source` / locker with honest details.
- Exclusive-audio leftover OPFS wording matches code (not sent to mpv).
- This plan’s `context/design.md` is not linked from living docs.
