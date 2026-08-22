# Stage 02: Client origin plumbing

## Status
done

## Description

Carry `origin` on the listen event, outbox, and `POST /api/listens` body. Queue play starts cycles with `origin: "queue"`. Radio still does not start a cycle.

## Rationale

Stage 03 can only send `radio` if the existing listen path already persists `origin`. Doing this before radio wiring keeps the 70% accumulator and flush tests independent of chrome states.

## Invariants

- Outbox key stays `musicweb.listens.pending.v1`. Do not bump the key.
- A pending row without `origin` reads as `queue` (rows written before this stage).
- `startCycle` / `createListenCycle` require `origin` (`queue` | `radio`). No silent default on new cycles.
- Queue `maybeStartListenCycle` always passes `origin: "queue"`. Exclusive companion is `queue`.
- Flush still uses `apiFetch` / `postListen` (never `apiPost`). 204 / 422 / retry rules unchanged.

## Risks

- Requiring `origin` in `isPending` without accepting a missing field would drop every in-flight outbox row on upgrade.

## Implementation

### Files

- `frontend/src/listens/accumulator.ts`
- `frontend/src/listens/bridge.ts`
- `frontend/src/listens/outbox.ts`
- `frontend/src/listens/flush.ts`
- `frontend/src/api.ts`
- `frontend/src/playback/load.ts`
- `frontend/tests/listens/accumulator.test.ts`
- `frontend/tests/listens/outbox.test.ts`
- `frontend/tests/listens/flush.test.ts`

### Steps

1. In `frontend/src/listens/accumulator.ts`, add `ListenOrigin = "queue" | "radio"`. `ListenEvent` and `createListenCycle` opts include `origin: ListenOrigin`. `canFire` still requires `playSource` `streaming` | `downloaded`. Emit copies `opts.origin` onto the event. Do not infer origin from play source.
2. `startCycle` in `frontend/src/listens/bridge.ts` requires `origin` and passes it through.
3. `PendingListen` in `frontend/src/listens/outbox.ts` includes `origin: "queue" | "radio"`. `isPending` accepts missing `origin` and treats it as `"queue"`; reject any present value that is not `queue` or `radio`.
4. `enqueueListen` in `frontend/src/listens/flush.ts` writes `origin: event.origin`. `postListen` in `frontend/src/api.ts` includes `origin` on the JSON body.
5. `maybeStartListenCycle` in `frontend/src/playback/load.ts` passes `origin: "queue"`.
6. Tests: accumulator helper and fire assertion include `origin: "queue"`; add one fire with `origin: "radio"` that copies through. Outbox: a stored row without `origin` reads back as `queue`; a row with `origin: "radio"` is kept; `origin: "exclusive"` is dropped. Flush: `postListen` is called with `origin` present (queue sample is enough). Existing 204 / 422 / backoff cases still pass.

### Verify

```sh
pnpm --dir frontend test -- tests/listens/accumulator.test.ts tests/listens/outbox.test.ts tests/listens/flush.test.ts
pnpm --dir frontend typecheck
```

## Acceptance

- New listen events always have `origin`.
- Queue play POSTs `origin: "queue"`.
- Pre-origin outbox rows still flush as `queue`.
- Radio still does not call `startCycle`.
