# Stage 07: Living docs

## Status
done

## Description

Update the shipped systems and frontend docs so play intent, `stream_intent`, the catalog writer, and the session handoff are the documented owners. Do not treat `context/design.md` as living documentation.

## Rationale

Stages 03–06 change ownership. The next agent that touches play, prepare, or downloads will re-clone the old forks if the living docs still describe `playHtml` / `plan_stream` / catalog-as-codec-façade / `app.state.scanner`.

## Invariants

- Source remains the source of truth for request shapes, IDB columns, and encoder argv.
- Docs describe intent and owners, not a second copy of `stream_intent`’s match table.
- No new ADR.

## Risks

- `docs/architecture/index.md` still says “scanner” on `app.state`. If this stage does not fix that line, the husk returns as documentation.

## Implementation

### Files

- `docs/systems/playback.md`
- `docs/systems/transcoding.md`
- `docs/systems/downloads.md`
- `docs/systems/radio.md` (tune-in vs play-as-source only, if the current text implies prepare encodes lossy)
- `docs/frontend/conventions.md`
- `docs/architecture/index.md`
- `docs/development/project-structure.md` (only if it still names `scan/scanner.py` or `app.state.scanner`)

### Steps

1. `playback.md`: document `resolvePlayIntent` as the single play decision; exclusive is companion + streaming; HTML uses `resolvePlaySource`; prepare is `playback/prepare.ts`. Player store is no longer described as a façade that “just re-exports `player`” while hiding loaders — say `player.ts` owns the on-demand session (gen, sink, load) and `onDemandControl` owns handoff.
2. `transcoding.md`: replace `plan_stream` with `stream_intent`. HTTP maps `reject`. `enqueue_prepare` skips non-encode. Forget skips tracks that cannot have encode cache via the same function. Do not re-list every tag table.
3. `downloads.md`: codec helpers live in `media.ts`. Catalog owns projection + records + art + the write mutex. Finalize is one txn including the queue row. `blobs` is not a store. Fix leftover `.js` names in the import-surface table to `.ts` while touching that page.
4. `conventions.md`: player/radio handoff via `claimOnDemand` / `claimRadio`; do not import `radio.ts` from `player.ts`; radio watches `player.volume`.
5. `architecture/index.md` composition root: `jobs`, not `scanner`. Same for `project-structure.md` if it still points at `scan/scanner.py`.

### Verify

- Read the six paths above: no `plan_stream`, no `playHtml`/`playExclusive` as current API, no `blobs` fallback, no `app.state.scanner`.
- No new file under `docs/architecture/` beyond the index line fix.

## Acceptance

- Living docs match stages 01–06 as shipped.
- `context/design.md` is not linked as an operator or agent source of truth.
- Out-of-scope items (browse hosts, `TrackView`, job phase table) are not promised as done.
