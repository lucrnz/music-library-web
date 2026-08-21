# Stage 05: Living docs

## Status
done

## Description

Update the shipped ownership docs so they name `present_audio`, the single `LibraryView` browse host, `useEntityMenu`, the cover-getter contract, and the teardown rules. No new ADR.

## Rationale

Stages 01–04 change ownership and safe-change rules. Leaving conventions and architecture on `DownloadsLibraryView` / resolve-and-exists wrappers will recreate the twins.

## Invariants

- `docs/plans/` is not living documentation. Do not add a plan-archive note beyond what the implementer already does when marking stages done.
- Do not restate encoder argv, route JSON, or IDB schemas. Point at source.

## Risks

None

## Implementation

### Files

- `docs/frontend/conventions.md`
- `docs/systems/playback.md`
- `docs/development/project-structure.md`
- `docs/architecture/index.md`
- `docs/systems/downloads.md` (browse host / cover sentence only if it still names a second library SFC)

### Steps

1. Conventions: `App.vue` mounts one `LibraryView` for online and downloads (`mode === "downloads"`). `useEntityMenu` is the entity-menu owner (list + tree). Row `coverSrc` omitted/`null` = remote fallback; `""` = placeholder. Artists stay snake_case — do not add `fromApiArtist` in this pass.
2. Playback: document the teardown pair (`beginLoad` stops HTML; companion stops on unavailable or sink change; `stopOnDemandSinks` revokes the local blob). Exclusive track-to-track does not release companion. Delete any implication that `beginLoad` stops every sink.
3. Project-structure + architecture: `Library` owns `resolve` (jail) and `present_audio` (present indexable audio). Routes/enqueue/radio/scan do not reimplement exists+audio.
4. Downloads doc: offline browse is a `LibraryView` source, not `DownloadsLibraryView`. Catalog/OPFS ownership unchanged.

### Verify

- `rg -n "DownloadsLibraryView|_resolve_track_file" docs --glob '!docs/plans/**'` is empty.
- `rg -n "present_audio" docs/development/project-structure.md docs/architecture/index.md` hits both.

## Acceptance

- Living docs match shipped names from stages 01–04.
- No new ADR. Conventions still forbid a second entity-menu store and still keep artist leaves snake_case.
- Plan stages 01–04 remain the implementation source; this stage does not add steps for them.
