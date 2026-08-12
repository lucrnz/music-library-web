# Stage 01: Catalog records → Track[] projector

## Status
done

## Description

Add a pure batch projector next to `fromCatalogRecord` that turns offline catalog track records into client `Track[]`, skipping unmappable rows silently. No queue, toast, or UI wiring.

## Rationale

Downloads tree album nodes hold IDB catalog records (`node.data.tracks`). List-mode browse already projects at the boundary; group-add needs the same projection without teaching `libraryActions` the catalog record shape or inventing a thin `addAllDownloadedTracks` wrapper. Projection policy (including silent skip) belongs on the track model boundary, not in playlist or pane code.

## Implementation

### `models/track.js`

- Export something like `tracksFromCatalogRecords(records)`:
  - Accept `records` array-like or empty; treat null/undefined as no tracks.
  - For each item, try `fromCatalogRecord`; on throw, **skip** that row (do not abort the batch).
  - Return `Track[]` in input order (hierarchy already disc/track-sorted).
- Keep JSDoc aligned with existing `fromCatalogRecord` / catalog-record notes.
- **Do not** import playlist, toast, or UI stores.
- **Do not** add anything to `libraryActions.js` this stage.

### Out of scope

- Tree group-add UI (stage 02).
- Failure toasts (stage 02 runner).
- Artist-level downloads bulk add.
- Changing `downloadsSource` / hierarchy to pre-store `Track[]` on nodes.
