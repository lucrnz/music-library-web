# Stage 05: User-facing hyphens

## Status
done

## Description

Replace em dash separators in remaining user-facing SPA copy with ASCII hyphen-minus. Leave standalone empty-value `—` and comments alone.

## Rationale

Em dashes in labels read as generated copy. Stage 04 already hyphenated now-playing and radio; this stage finishes the visible sentences and the other `Artist — Album` joiners (queue and search tracks) without giving them a year.

## Invariants

- Replace ` — ` inside user-visible strings with ` - `.
- Do not replace a token that is only `—` (PlayerBar empty title, settings blanks, scan status, `formatBytes` failure, SettingsSelect empty).
- Do not rewrite comment or docstring dashes.
- Queue and search `TrackRow` gain the hyphen only; no year.

## Risks

- A careless replace will turn empty glyphs into `-`. Review each hit; do not `sed` the tree.
- `LOSSY_SOURCE_COPY` is compared by identity in playback-status tests; changing the constant is enough.

## Implementation

### Files

- `frontend/src/connectivity.ts`
- `frontend/src/downloads/worker.ts`
- `frontend/src/downloads/browse.ts`
- `frontend/src/downloads/queuePolicy.ts`
- `frontend/src/downloads/storageInfo.ts`
- `frontend/src/playback/load.ts`
- `frontend/src/lossyKind.ts`
- `frontend/src/listens/rangeChips.ts`
- `frontend/src/components/player/LyricsOverlay.vue`
- `frontend/src/components/downloads/DownloadsModal.vue`
- `frontend/src/components/downloads/DownloadIcon.vue`
- `frontend/src/components/playlist/PlaylistView.vue`
- `frontend/src/components/library/loaders.ts`
- `frontend/src/components/library/rows/TrackRow.vue`
- `frontend/tests/downloads/storageInfo.test.ts`
- `frontend/tests/listens/rangeChips.test.ts`

### Steps

1. In each source file listed under Files, replace user-visible ` — ` with ` - ` (offline/server load errors, download pause banners and errors, empty library/downloads/playlist copy, lossy tooltip, range-chip `YYYY - Month`, lyrics overlay, download icon titles, “file unreadable” leaf, exclusive unknown-format toast, queue and search-track artist/album joiner).
2. Leave any standalone empty-value `—` in those files unchanged (`formatBytes` failure in storage info; track-number fallback in the downloads modal). Do not open other components to hunt glyphs.
3. Update the two test files so assertions match the new hyphen copy (`Ready - no downloads yet`, `2025 - December`).
4. Grep `frontend/src` for ` — ` and confirm every remaining hit is a comment, a leftover empty glyph, or a string already converted in stage 04.

### Verify

```sh
pnpm --dir frontend test -- frontend/tests/downloads/storageInfo.test.ts frontend/tests/listens/rangeChips.test.ts frontend/tests/playback/playbackStatus.test.ts frontend/tests/stores/radio.test.ts
pnpm --dir frontend typecheck
rg -n ' — ' frontend/src frontend/tests
```

## Acceptance

- Queue row subtitle is `Artist - Album` with no year.
- Search track subtitle uses the hyphen joiner.
- Visible pause/offline/empty/lossy/range-chip sentences use ` - `, not ` — `.
- Empty-value glyphs are still `—`.
- The listed tests and typecheck pass. Remaining ` — ` hits under `frontend/src` are comments only (or stage 04 already converted).
