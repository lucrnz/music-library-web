# Stage 06: Stream prepare skip via catalog projection

## Status
done

## Description

Rewrite `tracksNeedingPrepare` / `trackNeedsStreamPrepare` in `stores/playlist.js` to use in-memory **`catalogIndex`** from `catalog.js` when downloads are enabled.

**Cold / missing projection entry:** **still prepare** (unknown ⇒ might need stream). No IDB `getTrackRecord` in this path.

- Prefer-local when projection has codec, status ≠ `broken`, and `shouldPreferLocalOnline(...)` is true.
- Downloads disabled: unchanged (all tracks with ids need prepare).
- Near-end prepare and add-to-queue both go through these helpers.

## Rationale

Projection is already the canonical catalog face for UI. Sequential IDB in prepare re-derives it and serializes add-all. Missing-entry ⇒ prepare is simple and safe.

## Implementation

1. Import `catalogIndex` (or a tiny helper on `catalog.js`) into playlist store.
2. Make prepare-need filtering synchronous over projection; no IDB fallback.
3. Smoke: all-downloaded album under prefer_offline/prefer_better avoids prepare spam; mixed catalog still prepares stream-needed tracks; downloads off prepares all.
