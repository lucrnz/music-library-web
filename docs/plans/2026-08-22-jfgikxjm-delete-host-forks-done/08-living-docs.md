# Stage 08: Living docs

## Status
done

## Description

Patch existing systems and frontend docs so they name the shipped leftover-fork deletes. No new ADR. `context/design.md` is not living documentation.

## Rationale

Docs still describe the last plan’s intended owners as if the leftover hosts were already gone. This stage writes the names this plan actually ships.

## Invariants

- Patch existing pages only. No new systems page. No new ADR.
- Do not document archived plan paths as source of truth.

## Risks

None

## Implementation

### Files

- `docs/frontend/conventions.md`
- `docs/systems/playback.md`
- `docs/systems/radio.md`
- `docs/systems/downloads.md`
- `docs/systems/exclusive-audio.md`
- `docs/systems/library-scan.md`
- `docs/development/project-structure.md`

### Steps

1. `docs/frontend/conventions.md`: fail path is `failCurrentLoad` only (no `failNotice`). `setOutputVolume` is the only volume writer; `player.ts` watches `player.volume` for the active sink; radio watches for radio audio. Radio face machine lives in `radio/runtime.ts`. Queue abort lives in `queueRuntime.ts`. Saved playlists expose `trackCount`.
2. `docs/systems/playback.md`: same fail + volume owners. Offline queue skip uses `isOfflineUnplayable`.
3. `docs/systems/radio.md`: `runtime.ts` owns socket, load generation, Media Session, `onFaceOrTrack`, and reconnect. Store is the chrome face. `connected` tracks socket open. One `socketRequired`.
4. `docs/systems/downloads.md`: `queueRuntime.ts` owns pump **and** abort. `queue.ts` is IDB + events + progress. No `markDownloadBroken` / `commitTrackDownload`.
5. `docs/systems/exclusive-audio.md`: companion hub is a module-level `COMMANDS` table + `_with_live`. No `MSG_PLAY`. Store has no companion playing/paused mirrors.
6. `docs/systems/library-scan.md`: job context is `PhaseCtx`; `_begin_phase` owns phase state + scan progress. Artist-image HTTP goes through `provider_json`.
7. `docs/development/project-structure.md`: same owners — radio runtime face, queue abort, `PhaseCtx`, exclusive `COMMANDS`.

### Verify

- `rg -n "failNotice|refreshPlayerCovers|currentLoadKeys|abortAllJobs|markDownloadBroken|commitTrackDownload|MSG_PLAY|_still_live|commitHogToken" docs/frontend docs/systems docs/development` is empty
- `rg -n "queueRuntime\\.ts|_begin_phase|PhaseCtx|_with_live|onFaceOrTrack|setOutputVolume|isOfflineUnplayable" docs/frontend/conventions.md docs/systems/playback.md docs/systems/radio.md docs/systems/downloads.md docs/systems/exclusive-audio.md docs/systems/library-scan.md docs/development/project-structure.md` matches the new owners

## Acceptance

- Living docs listed in Files describe one fail host, one volume writer, radio face in `runtime.ts`, queue abort in `queueRuntime.ts`, `PhaseCtx` / `_begin_phase`, and exclusive `COMMANDS` + `_with_live`.
- No leftover names from this plan’s Deletes remain in those pages.
