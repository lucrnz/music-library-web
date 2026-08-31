# Stage 01: Remove client listen collection and Stats UI

## Status
done

## Description

Delete the household listen client (cycle, outbox, flush) and the Stats browse mode. Playback, radio, and CD keep working; they stop counting. `/stats` is no longer a registered route and ModeBar no longer offers Stats.

## Rationale

Collection and UI are one surface (`StatsView` imports `frontend/src/listens/`). Removing them first stops the flaky counter and the ModeBar entry before the API is deleted, so a still-current client is not left POSTing into a 404 with localStorage retry.

## Invariants

- Do not change sink load/seek/ended/pause behavior except by removing `@/listens/bridge` calls.
- Do not add a `/stats` redirect.
- Do not add a localStorage cleaner for `musicweb.listens.pending.v1`.
- Keep `initAudioListeners`, `initRadioListeners`, and `initCdListeners` in `frontend/src/main.ts`.
- Keep `GET /api/library/stats` usage in `LibraryScanPanel.vue`.
- Do not edit backend listen routes, models, or docs in this stage.

## Risks

- Radio `bindAudioHandlers` `onTime` exists only to feed the listen cycle. After the hook is gone the handler is a no-op and must be removed, not left empty.
- `startCdListenIfLoaded` is exported and called from identify apply; deleting the export without updating `identifyFlow.ts` and `cdLoad.test.ts` will fail typecheck.

## Implementation

### Files

- `frontend/src/listens/`
- `frontend/src/listens/accumulator.ts`
- `frontend/src/listens/bridge.ts`
- `frontend/src/listens/flush.ts`
- `frontend/src/listens/outbox.ts`
- `frontend/src/listens/rangeChips.ts`
- `frontend/src/listens/types.ts`
- `frontend/src/components/stats/`
- `frontend/src/components/stats/StatsArtistRow.vue`
- `frontend/src/components/stats/StatsTrackRow.vue`
- `frontend/src/components/stats/StatsView.vue`
- `frontend/tests/listens/`
- `frontend/tests/listens/accumulator.test.ts`
- `frontend/tests/listens/outbox.test.ts`
- `frontend/tests/listens/flush.test.ts`
- `frontend/tests/listens/rangeChips.test.ts`
- `frontend/src/main.ts`
- `frontend/src/api.ts`
- `frontend/src/router.ts`
- `frontend/src/components/layout/ModeBar.vue`
- `frontend/src/components/library/LibraryView.vue`
- `frontend/src/components/library/browseChrome.ts`
- `frontend/src/stores/player.ts`
- `frontend/src/playback/load.ts`
- `frontend/src/radio/session.ts`
- `frontend/src/stores/radio.ts`
- `frontend/src/playback/cdLoad.ts`
- `frontend/src/cd/identifyFlow.ts`
- `frontend/css/library.css`
- `frontend/tests/radio/session.test.ts`
- `frontend/tests/stores/radio.test.ts`
- `frontend/tests/playback/cdLoad.test.ts`
- `frontend/tests/cd/identify.test.ts`

### Steps

1. Delete `frontend/src/listens/accumulator.ts`, `frontend/src/listens/bridge.ts`, `frontend/src/listens/flush.ts`, `frontend/src/listens/outbox.ts`, `frontend/src/listens/rangeChips.ts`, and `frontend/src/listens/types.ts` (the whole `frontend/src/listens/` module).
2. Delete `frontend/src/components/stats/StatsView.vue`, `frontend/src/components/stats/StatsArtistRow.vue`, and `frontend/src/components/stats/StatsTrackRow.vue`.
3. Delete `frontend/tests/listens/accumulator.test.ts`, `frontend/tests/listens/outbox.test.ts`, `frontend/tests/listens/flush.test.ts`, and `frontend/tests/listens/rangeChips.test.ts`.
4. In `frontend/src/main.ts`, remove the `initListens` import from `@/listens/flush` and the `initListens()` call. Leave the other `init*` boots.
5. In `frontend/src/api.ts`, remove the `@/listens/types` import, `postListen`, `mapListenTrack`, `mapListenArtist`, and `fetchListenRankings`.
6. In `frontend/src/router.ts`, delete the `/stats` route object (`name: "stats"`, `meta.mode: "stats"`). Add no redirect and no catch-all.
7. In `frontend/src/components/layout/ModeBar.vue`, remove `{ id: "stats", label: "Stats", name: "stats" }` from `BASE_MODES`.
8. In `frontend/src/components/library/LibraryView.vue`, remove the `StatsView` import and `<StatsView v-else-if="mode === 'stats'" />`. Drop every `mode === "stats"` / `mode !== "stats"` branch (`isTreeActive`, `onNavigate` early return, `onMounted` skip-`load`, forced title `"Stats"`, hide-back). After this, stats is not a browse mode.
9. In `frontend/src/components/library/browseChrome.ts`, drop `|| mode === "stats"` from `libraryShowTree`. Search already returns false via `isSearch` / `mode === "search"`.
10. In `frontend/src/stores/player.ts`, remove the `@/listens/bridge` import (`discardListen`, `onListenEnded`, `onListenRestart`, `onListenTime`). In `onSinkEnded`, delete `onListenEnded()` and `onListenRestart()`; keep repeat-one seek-0 and `playNext`. In `onSinkTime`, delete the `onListenTime({...})` call; keep seeking-guard, duration, resume, `currentTime`, position, and prepare. In `stopPlayback`, delete `discardListen()`. In `playPrev`, delete `onListenRestart()` on the seek-0 branch; keep the seek itself.
11. In `frontend/src/playback/load.ts`, remove the `@/listens/bridge` import. Delete `discardListen()` from `beginLoad`. Delete `maybeStartListenCycle` and its call after a successful load.
12. In `frontend/src/radio/session.ts`, remove the `@/listens/bridge` import. Delete `discardListen()` from `clearLoadedKeys` and `loadCurrent`. Delete the `startListenCycle({...})` block after a successful tuned load. In `bindAudioHandlers`, delete `onListenEnded()` from `onEnded` (keep `cancelRadioJoinHold`). Remove the listen-only `radioAudio.sink.setHandlers({ onTime })` block entirely if it has no remaining work.
13. In `frontend/src/stores/radio.ts`, remove the `discardListen` import and the `discardListen()` call in `tuneIn`. `clearLoadedKeys()` already ran discard; after step 12 that path is gone too.
14. In `frontend/src/playback/cdLoad.ts`, remove the `@/listens/bridge` import. In `bindHandlers`, drop `onTime({...})` from the sink `onTime` callback and `onEnded()` from sink `onEnded`; keep `player.currentTime` / duration / face updates and `void cdNext()`. In `cdLoad`, delete `discard()` and the `startCycle({...})` block (keep `sink.load`, volume, `loadedIndex`, Media Session). In `cdStopTransport`, delete `discard()`. Delete the entire `startCdListenIfLoaded` export.
15. In `frontend/src/cd/identifyFlow.ts`, remove the `startCdListenIfLoaded` import and the `if (activeSession() === "cd" && row) startCdListenIfLoaded(row)` call after apply. Keep cursor-preserving apply.
16. In `frontend/css/library.css`, delete `.stats-view`, `.stats-chips`, `.stats-heading`, and `.row-plays`.
17. In `frontend/tests/radio/session.test.ts`, remove the `vi.mock("@/listens/bridge", ...)` module mock, the `discard` / `startCycle` import, and every `expect(startCycle)` / `mockClear` on that spy. Keep load / tune / remint assertions.
18. In `frontend/tests/stores/radio.test.ts`, remove the same `@/listens/bridge` mock, import, and the assertion that tab-open does not `startCycle`. Keep `initRadioListeners` idempotency and other chrome tests.
19. In `frontend/tests/playback/cdLoad.test.ts`, delete the test `"starts a listen on apply only when that index is already loaded"` (it imports `startCdListenIfLoaded` and spies `startCycle`). Keep reload/seek tests.
20. In `frontend/tests/cd/identify.test.ts`, in `"keeps the current track number and does not start a listen without transport"`, remove the `@/listens/bridge` spy. Keep the cursor-preserving apply assertions. Rename the test so it does not mention listens.

### Verify

- `pnpm --dir frontend typecheck` exits 0.
- `pnpm --dir frontend test` exits 0.
- `rg -n "@/listens|components/stats|startCdListenIfLoaded|postListen|fetchListenRankings" frontend/src frontend/tests` is empty.
- `rg -n "id: \"stats\"|name: \"stats\"|mode === ['\"]stats['\"]" frontend/src` is empty.
- `frontend/src/router.ts` has no `/stats` path and no redirect from `/stats`.
- `frontend/src/components/settings/LibraryScanPanel.vue` still calls `GET /api/library/stats`.

## Acceptance

- ModeBar chips are Artists, Albums, Search, and Downloads (when enabled). There is no Stats chip.
- There is no `/stats` route. Visiting `/stats` is an unmatched SPA path (no redirect added).
- Queue, radio, and CD playback still load, seek, end, and stop. None of those paths import `@/listens/bridge` or start a listen cycle.
- Identify apply still keeps the current CD track number and does not call a listen helper.
- The listen module, Stats components, and `frontend/tests/listens/` are gone.
- Typecheck and the frontend test suite pass.
