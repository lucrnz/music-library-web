# Stage 08: Living docs

## Status
done

## Description

Update living-doc ownership pointers to the file locations this plan created or moved. No behavior redesign. `context/design.md` stays archive.

## Rationale

Each code stage is a behavior-preserving delete. Pointers in conventions / structure / systems docs must match the finished tree so the next agent does not revive `PHASES`, `PlayDelivery`, or `RadioRuntimeHost`.

## Invariants

- Source remains the source of truth for request shapes, table columns, and encoder argv.
- Docs only change when a source-of-truth **path** or ownership sentence is now wrong.

## Risks

- Rewriting design into living docs. If a paragraph is not a file-location or ownership sentence, leave it.

## Implementation

### Files

- docs/frontend/conventions.md
- docs/development/project-structure.md
- docs/systems/playback.md
- docs/systems/radio.md
- docs/systems/downloads.md
- docs/systems/library-scan.md
- docs/architecture/index.md

### Steps

1. `docs/frontend/conventions.md`: play decision is `playIntent.ts` (`resolvePlayIntent`, `shouldPrepare`, `isPlayableNow`) plus `deliveryPolicy.ts` as the exclusive-aware `{ sink, profileFor }` builder. `PlayDelivery` / `exclusiveEnabled` / `bindSettingsPrepareTracks` / `StreamChangeCtx` are gone. Radio face/load is `radio/session.ts`; `runtime.ts` is socket only; radio audio implements `PlaybackSink`. `TreeNode` lives in `components/tree/treeNode.ts`. Catalog view is cached `loadDownloadsCatalogView` in `snapshot.ts`.
2. `docs/development/project-structure.md`: jobs row — runner is single-flight / `ScanState`; scan job functions live in `scan/jobs.py` (no `PHASES`). Radio snapshot serialize still on `routes/radio.py`. Forget retain hook is lifespan + `routes/deps.retain_stream_ids`, not `media.py` → station.
3. `docs/systems/playback.md`: same play-decision / prepare / settings ownership as conventions. Settings persist codec/policy; `player.ts` owns prepare-on-change.
4. `docs/systems/radio.md`: client socket vs session split; server forget retain callback (not `media.py` importing the station).
5. `docs/systems/downloads.md`: one catalog view, invalidate on writer mutations. Do not claim `index.ts` was collapsed.
6. `docs/systems/library-scan.md`: replace `PHASES` / `_run_phases` / `_do_*` sentences with `scan/jobs.py` functions. Batch + siblings share a metadata cache. Lyrics pass1b remains.
7. `docs/architecture/index.md`: only if a layer/owner path in the table is now wrong (`jobs/`, `scan/`, radio retain).

### Verify

- `rg -n "PHASES|PlayDelivery|RadioRuntimeHost|bindSettingsPrepareTracks|exclusiveEnabled|app.state.radio.retained" docs/frontend docs/development docs/systems docs/architecture` is empty.
- `rg -n "scan/jobs.py|deliveryPolicy.ts|radio/session.ts|treeNode.ts|retain_stream_ids|invalidateDownloadsCatalogView" docs/frontend/conventions.md docs/development/project-structure.md docs/systems/playback.md docs/systems/radio.md docs/systems/downloads.md docs/systems/library-scan.md` hits the new owners.

## Acceptance

- Every path named in stages 01–07 that this stage claims to document appears in the listed living docs.
- No leftover pointer to `PHASES`, `PlayDelivery`, `RadioRuntimeHost`, `bindSettingsPrepareTracks`, `PlayIntentCtx.exclusiveEnabled`, or `media.py` reading `app.state.radio`.
- `docs/plans/2026-08-22-7lo0z2o7-nuclear-judo-pending/context/design.md` is untouched (archive).
