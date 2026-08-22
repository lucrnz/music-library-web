# Stage 08: Living docs

## Status
done

## Description

Patch existing docs so they name the shipped modules. No new ADR. No copied type shapes.

## Rationale

`design.md` is not living documentation. Ownership names moved; conventions and systems pages still point at `onDemandControl.ts`, `radio.ts` as socket owner, `resolvePlaySource` returning `PlayIntent`, and CoverStore aliases.

## Invariants

- Docs stay at intent / ownership / source-of-truth paths. No payload field lists.
- No new page unless a source-of-truth path has nowhere to live (none expected).

## Risks

- None

## Implementation

### Files

- `docs/frontend/conventions.md`
- `docs/systems/playback.md`
- `docs/systems/radio.md`
- `docs/systems/downloads.md`
- `docs/systems/library-scan.md`
- `docs/systems/exclusive-audio.md`
- `docs/systems/connectivity.md`
- `docs/development/project-structure.md`

### Steps

1. `docs/frontend/conventions.md`: session owner is `playback/session.ts`. HTML delivery is `resolvePlaySource` (no sink). Radio socket/load live in `radio/runtime.ts`; the store is the face. `setStreamCodec` does not take `playIndex`. Browse source owns tree title / empty / focus / reload; hosts do not switch on mode for those. Catalog records are storage-only; queue snapshot is a `Track`. Exclusive store does not import the client.
2. `docs/systems/playback.md`: source-of-truth paths for `session.ts`, delivery result in `resolve.ts`, HTML helper, codec camel at settings hydrate, `failCurrentLoad` without the flag bag. Delete `onDemandControl.ts` and “returns `PlayIntent` (`sink: htmlAudio`)” from resolve.
3. `docs/systems/radio.md`: runtime module owns the socket; store is chrome. `serialize` lives in `routes/radio.py`. `SnapshotTrack.from_track`.
4. `docs/systems/downloads.md`: `snapshot.ts` is the catalog view; `queueRuntime.ts` owns pump; worker is I/O via `streamUrl`; no `downloadMeta`; `CatalogTrackRecord` has no snake aliases.
5. `docs/systems/library-scan.md`: job `PHASES` / `_run_phases` in `jobs/runner.py`; `scan/enrichment.py` is the enrichment loop; sidecar `.lrc` helper owner; CoverStore extract vs `WebpAssetStore` has/path.
6. `docs/systems/exclusive-audio.md`: one-way imports; `setExclusiveLive`; `COMMANDS` + `_with_live` on the companion hub. Device casing is `sample_rates` / `bit_depths`.
7. `docs/systems/connectivity.md`: delete `setHealthContext`. Downloads call `setHealthWork("downloads", enabled && queueHasWork)`.
8. `docs/development/project-structure.md`: same ownership names (radio serialize on the route, session module, queue runtime, enrichment module, CoverStore extract-only).

### Verify

- `rg -n "onDemandControl|setHealthContext|normalizeTrack|radio/now_playing|downloadMeta|PlayIntent \\(\`sink:" docs/frontend docs/systems docs/development` is empty
- Docs still point at files, not field lists

## Acceptance

- Living docs name `playback/session.ts`, `radio/runtime.ts`, `downloads/snapshot.ts`, `downloads/queueRuntime.ts`, `scan/enrichment.py`, and `routes/radio.py` `serialize`.
- No leftover `onDemandControl`, `setHealthContext`, or resolve-returns-PlayIntent wording.
- No new ADR. No schema copies.
