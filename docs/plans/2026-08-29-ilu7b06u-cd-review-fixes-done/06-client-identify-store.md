# Stage 06: Client identify and store split

## Status
done

## Description

Consume identify’s `applied` snapshot. Move identify orchestration out of `stores/cd.ts`. Delete enter/gone hook setters. Reload hog via Vue `watch`. Type the applied DTO and TOC once.

## Rationale

The store became the identify saga, a hook bus, and a face machine. Radio already splits prefs/live from transport. Stage 01 made the extra GET and the CD-Text album title unnecessary.

## Invariants

- Store remains prefs + live optical + cursor + face. No second `cdPlayback.ts`.
- `companionClient.ts` still does not import `stores/cd.ts`.
- `player.ts` still does not import `stores/cd.ts`.
- `decideIdentify` stays a pure function. Prefer `applied`, else unique / picker / cdtext / unknown.
- No `GET /identities` after identify when `applied` is present.
- `applyCdDto` sets `album` / `artist` from the DTO, not CD-Text, after confirm/memory.
- `canShowCdUi` is `canShowExclusiveUi` (same predicate).
- Delete unused `pickConfirmMatch` unless a caller exists after the split.
- Exclusive mid-play reload stays one load + seek; discovery is a store subscription, not a timer.

## Risks

- Wiring `cdLoad` without hook setters can reintroduce a cycle. Bind from `main.ts` or a tiny `frontend/src/cd/runtime.ts` that both import.
- `companion_offline` is a declared face: `refreshCdFace` must assign it when CD is on and the companion socket is down, or delete the face from the union and the status map.

## Implementation

### Files

- `frontend/src/stores/cd.ts`
- `frontend/src/cd/identify.ts`
- `frontend/src/cd/identifyFlow.ts`
- `frontend/src/cd/runtime.ts`
- `frontend/src/cd/types.ts`
- `frontend/src/api.ts`
- `frontend/src/playback/cdLoad.ts`
- `frontend/src/main.ts`
- `frontend/src/exclusive/capability.ts`
- `frontend/src/playbackStatus.ts`
- `frontend/tests/cd/identify.test.ts`
- `frontend/tests/stores/cd.test.ts`
- `frontend/tests/exclusive/capability.test.ts`
- `frontend/tests/playback/cdLoad.test.ts`

### Steps

1. `CdIdentifyResponse.applied?: CdApplied | null`. `CdApplied` gains `album`, `artist`, `year`. API functions use `CdTocPayload` / `CdTextPayload` from `cd/types.ts`.
2. `identifyFlow.ts`: `runIdentify` / `applyCdDto` / sentinels. `decideIdentify` prefers `identify.applied`. Do not GET when `applied` is set. Confirm still for unique-without-memory.
3. Store: delete `runIdentify` / hook setters / DTO mapping. Keep `refreshCdFace`; set `companion_offline` when capable, enabled, and the companion is down. `playbackStatus.ts` maps every `CdRoomFace` explicitly (`Record<CdRoomFace, string>`); unknown is not “No disc”.
4. `cd/runtime.ts` (or `main.ts`): `enterCdMode` calls `installCdMediaSession`; media-gone calls `cdStopTransport`. `cdLoad.ts` does not `setCdEnterHook`.
5. Replace `initCdListeners` `setInterval(500)` with `watch` on `exclusiveAudio.enabled` / selected device (same shape as radio).
6. `canShowCdUi = canShowExclusiveUi`. Delete `pickConfirmMatch` if unused.
7. Tests: remembered disc applies `applied` with one identify POST and zero GETs; album title is the DTO’s; face `companion_offline` is reachable; hog reload runs on exclusive toggle without a fake timer; capability tests still treat both helpers as the Mac-PWA gate.

### Verify

```sh
pnpm --dir frontend test -- frontend/tests/cd/identify.test.ts frontend/tests/stores/cd.test.ts frontend/tests/exclusive/capability.test.ts frontend/tests/playback/cdLoad.test.ts
pnpm --dir frontend typecheck
```

## Acceptance

- Inserting a remembered disc: one identify POST, no GET, cursor titles/album from the snapshot.
- Unique new disc still confirms; several still open the picker; dismiss still does not write.
- `stores/cd.ts` has no `setCdEnterHook` / `setCdMediaGoneHook` / `setInterval`.
- `canShowCdUi` is not a copied predicate.
- Mid-play exclusive toggle still reloads at the same position (watch, not poll).
