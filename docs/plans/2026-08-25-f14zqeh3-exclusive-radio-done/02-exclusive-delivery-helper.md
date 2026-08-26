# Stage 02: Extract exclusiveDelivery

## Status
done

## Description

Move the exclusive URL / profile / block decision out of `resolvePlayIntent` into `exclusiveDelivery` so radio can reuse it without calling `resolvePlayIntent` or attaching a sink.

## Rationale

Radio is forbidden from calling `resolvePlayIntent` (that constructor attaches `htmlAudio` or `companion`). Stage 04 needs the same locker-vs-`source`-vs-exclusive-tag rules as queue. Extract first so 04 does not copy `exclusiveIntent`.

## Invariants

- `exclusiveDelivery(track, ctx)` returns the same ready/unavailable shape `exclusiveIntent` does today (no `sink` field). Ready: `source` `"streaming"` | `"downloaded"`, `profile`, `url`. Unavailable: `source: "unavailable"`, `block`, `message`.
- Lossy + streamable id → streaming + `SOURCE_TAG` + absolute `/api/stream?id=&codec=source`. No id → `exclusive_lossy`.
- Lossless + companion locker URL (policy win) → downloaded + that URL. Leftover `blob:` is not a companion URL and falls through to the exclusive tag / source stream.
- Lossless + no locker → exclusive tag from `ctx.exclusiveTag`; missing tag → `exclusive_no_format`.
- `resolvePlayIntent` with `ctx.sink === "companion"` calls `exclusiveDelivery` and attaches `sink: "companion"` on ready. HTML branch unchanged.
- Radio does not import this helper yet (stage 04). Existing `playIntent` tests stay green without new cases.

## Risks

- Moving the function can drift ctx fields. Keep the same `PlayIntentCtx` fields `exclusiveIntent` reads (`enabled`, `offline`, `exclusiveTag`, `activeStreamCodec`, `playbackPolicy`, `catalog`).
- Do not add a `sink` to the extracted result — that would tempt radio to treat it as a `PlayIntent`.

## Implementation

### Files

- `frontend/src/playback/exclusiveDelivery.ts`
- `frontend/src/playback/playIntent.ts`
- `frontend/tests/playback/playIntent.test.ts`

### Steps

1. Add `frontend/src/playback/exclusiveDelivery.ts`. Move `exclusiveIntent`’s body there as `export async function exclusiveDelivery(track, ctx)`. Import `hrefForStream` from `playIntent.ts` **or** move `hrefForStream` into this new file and re-export it from `playIntent.ts` so existing imports keep working. Prefer moving `hrefForStream` next to the helper if `playIntent.ts` would otherwise create a cycle (`exclusiveDelivery` already needs `resolvePlaySource` / `SOURCE_TAG` / `isCompanionFileUrl`).
2. Define a result type without `sink` (e.g. `ExclusiveDelivery`). Do not reuse `PlayIntent` for the extracted result.
3. In `frontend/src/playback/playIntent.ts`, `exclusiveIntent` becomes: `const d = await exclusiveDelivery(track, ctx);` then map unavailable → `blocked(...)`, ready → `{ sink: "companion", ...d }`.
4. In `frontend/tests/playback/playIntent.test.ts`, keep every exclusive case on `resolvePlayIntent`. No radio mocks. If `hrefForStream` moved, update that import only if the test file imported it (it currently does not).

### Verify

```sh
pnpm --dir frontend test -- frontend/tests/playback/playIntent.test.ts
pnpm --dir frontend typecheck
```

## Acceptance

- Exclusive lossy / locker / leftover-OPFS / missing-tag cases still pass through `resolvePlayIntent`.
- `exclusiveDelivery` has no `sink` field.
- `playIntent.ts` does not contain a second copy of the locker / source / tag branches.
- `pnpm --dir frontend typecheck` passes.
