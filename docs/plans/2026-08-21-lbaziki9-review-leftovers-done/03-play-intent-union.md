# Stage 03: Discriminated PlayIntent and linear load

## Status
done

## Description

Make `PlayIntent` a discriminated union (unavailable has no url; ready has `url: string`). Delete `prepareTag`. `loadIntent` uses one exclusive notice branch. `tracksToPrepare` drops the dead exclusive early-return.

## Rationale

`resolvePlayIntent` exists but `loadIntent` is still the old exclusive/HTML loader: `url!`, a five-reason OR, unused `sink` on blocked intents, and an unused `prepareTag`. This stage is the load-contract cut the last plan named and did not finish.

## Invariants

- Exclusive still refuses downloads and lossy. Exclusive ready intent is `sink: "companion"`, `source: "streaming"`.
- HTML still goes through `resolvePlaySource`. `localBroken` still forces stream or `broken` / `play_failed`.
- `intentForTrack` stays in `player.ts` (device gate, source-codec probe).
- `prepareTracks` still groups exclusive by `getExclusiveProfileTag`. Do not pass intents into prepare.
- Unavailable UX: exclusive blocks toast and do **not** prefix the track title; other blocks prefix `Title: message`.

## Risks

- Tests in `playIntent.test.ts` assert `prepareTag` and may assume a single object shape. Rewrite them against the union (`source === "unavailable"` vs ready `url`).
- Blocked exclusive `sink` goes away. Tests that expect `exclusive_no_format` → `companion` must stop checking `sink` on unavailable.

## Implementation

### Files

- `frontend/src/playback/playIntent.ts`
- `frontend/src/stores/player.ts`
- `frontend/src/playback/prepare.ts`
- `frontend/tests/playback/playIntent.test.ts`
- `frontend/tests/playback/prepare.test.ts` (only if it relied on `tracksToPrepare` exclusive return)

### Steps

1. Replace `PlayIntent` with a union, e.g. `{ source: "unavailable"; profile; block: PlayBlockReason; message: string | null }` | `{ source: "streaming" | "downloaded"; sink: PlaySink; profile; url: string }`. No `prepareTag`. No `sink` on unavailable. `blocked()` returns the unavailable variant.
2. `ExclusiveGate.reason` stays `PlayBlockReason | string | null`. Resolve with `reason in PLAY_BLOCK_MESSAGES` — no `as PlayBlockReason` before the check.
3. `loadIntent`: if `intent.source === "unavailable"`, set notice (`exclusive` → raw message + toast + maybe openSettings; else `Title: message`). No five-reason OR. Ready path: `selectSink(intent.sink)`; `attemptPlay(intent.url)` with no `!`. Keep missing-tech toast and downloaded-blob retry as today.
4. Delete `prepareTag` from tests. Assert unavailable vs `url` instead.
5. In `tracksToPrepare`, delete `if (isExclusiveEnabled()) return eligible`. Exclusive prepare stays only in `prepareTracks`’s group-by-tag branch. Drop the `isExclusiveEnabled` import from `prepare.ts` if unused there.

### Verify

- `rg -n "prepareTag|intent\\.url!" frontend/src` is empty.
- `rg -n "exclusive_lossy|exclusive_no_format" frontend/src/stores/player.ts` does not list those reasons in an OR chain for the notice.
- `pnpm --dir frontend typecheck`
- `pnpm --dir frontend test`

## Acceptance

- TypeScript treats ready `intent.url` as `string` and unavailable as having no url.
- `prepareTag` is gone.
- Exclusive unavailable: toast, no title prefix. Other unavailable: title prefix, no exclusive toast.
- `tracksToPrepare` does not branch on exclusive.
- `playHtml` / `playExclusive` stay gone. `player.ts` still does not import `radio.ts`.
