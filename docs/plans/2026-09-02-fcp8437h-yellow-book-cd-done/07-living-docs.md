# Stage 07: Living docs

## Status
done

## Description

Move the settled Yellow Book contract into the project’s living docs and remove “data-session / CD-ROM file playback” from CD out-of-scope lists. This plan directory stays an archive.

## Rationale

`design.md` is not living documentation. Operators and later agents will read `docs/systems/cd-playback.md`.

## Invariants

- Source remains the source of truth for message names, MIME types, and encoder argv.
- Docs state intent, occupancy, jail rules, and the Red Book / Yellow Book split.
- Windows/Linux optical, DVD/USB, rip/import, and mixed-mode switcher stay out of scope in those pages.

## Risks

- Editing the Red Book WAV / identify sections while adding Yellow Book can silently change the audio-CD contract.

## Implementation

### Files

- `docs/systems/cd-playback.md`
- `docs/systems/companion.md`
- `docs/systems/playback.md`
- `docs/systems/exclusive-audio.md`
- `docs/product/core-guidelines.md`
- `docs/frontend/conventions.md`
- `docs/README.md`

### Steps

1. Rewrite `docs/systems/cd-playback.md`: keep Red Book as-is; add a Yellow Book section (session, split room, as-is `/cdrom/file`, jail, `volume_id` identity, mount-retry, auto-add, lyrics order, faces `data` / `no_playable`, LossyMark for MP3/AAC/WMA including `fmt-wma`, closed playable list). Remove data-session from Out of scope. Keep Windows/Linux, rip, DVD/USB, mixed-mode switcher, DiskArbitration **identity** rewrite out of scope. Do not list **Not an audio CD** as the data-disc face.
2. `docs/systems/companion.md`: optical job is WAV **and** jailed CD-ROM file/cover/lyrics GET; data-disc watch does not TOC-open after classify; `/cdrom/*` token is 401, jail/miss is 404.
3. `docs/systems/playback.md` + `docs/frontend/conventions.md`: desktop right pane is `CdTrackList` (audio) or the Yellow Book split (data); CD-local queue is not `PlaylistView`; `cdLoad` keys data off `cdrom:` ids and profile `"cdrom"`; dedicated CD rows, private tree type.
4. `docs/systems/exclusive-audio.md`: Yellow Book hog uses the same load flag on the as-is URL; `cdLoad` does not use `exclusiveDelivery`; failure is honest.
5. `docs/product/core-guidelines.md` and `docs/README.md`: CD is Red Book + macOS Yellow Book file playback, still no rip. Yellow Book playable kinds stay off the library index (including WMA).

### Verify

- `rg -n "data-session / CD-ROM file playback" docs` is empty.
- `rg -n "Not an audio CD" docs/systems/cd-playback.md` only describes the old face as replaced, or does not list it as the data-disc face.
- `rg -n "Yellow Book|/cdrom/file|CD-local queue" docs/systems/cd-playback.md docs/systems/companion.md` hits the new sections.

## Acceptance

- Living docs match [context/design.md](context/design.md) decisions without copying stage file lists.
- Red Book WAV / identify / unripped-stub text is still present and not contradicted.
- This plan directory is not linked as the operator source of truth.
