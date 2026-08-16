# Stage 04: Thin frontend conventions and cross-links

## Status
done

## Description

Shrink the long downloads import matrix in `docs/frontend/conventions.md` to a short ownership pointer at `docs/systems/downloads.md`, and add light cross-links from related durable docs (product, PWA, transcoding) to the three new systems pages where readers would otherwise miss them.

## Rationale

Leaving the full downloads matrix in conventions duplicates ownership with the new systems page and will drift. Thin conventions keep SPA patterns; systems pages own subsystem design. Cross-links prevent orphan pages until the map stage lands.

## Implementation

1. In `docs/frontend/conventions.md`:
   - Replace the long downloads module bullet list with: offline catalog ownership, link to `docs/systems/downloads.md`, and a short import-surface rule (e.g. lifecycle vs UI confirm vs catalog vs resolve — one short list or “see systems page”).
   - Add brief pointers to `docs/systems/playback.md` and `docs/systems/connectivity.md` where player/settings/codec UX is mentioned.
   - Keep: no bundler, stores vs components, dialog/modal-lock rules, vendor pins.
2. In `docs/product/core-guidelines.md`: where quality prefs, offline downloads, or honest codecs are stated, link the matching systems page once each (do not rewrite product intent).
3. In `docs/systems/pwa.md`: ensure offline audio points at downloads systems page (not only “Downloads feature”).
4. In `docs/systems/transcoding.md`: client interaction section may link playback systems page for prepare/quality prefs (server encode remains this page’s owner).
5. Do not expand conventions with tree/lyrics/playlists (out of scope for this plan).
6. Map / AGENTS updates wait for stage 05.
