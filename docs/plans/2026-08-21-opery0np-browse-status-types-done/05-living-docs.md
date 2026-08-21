# Stage 05: living docs

## Status
done

## Description

Patch the living systems and frontend docs so they name camel `Artist` / `fromApiArtist`, catalog type without snake aliases, `BrowseSource` tree load, art-cache keys, stats-out-of-`load()`, and `PlayStatusState.session`. No leftover `ArtistListItem`, `RADIO_EXCLUSIVE_SNAP`, or `a:` / `al:` browse keys.

## Rationale

Conventions currently forbid an Artist mapper and say artists stay snake. Playback-stats says the same. Those sentences would be false the day 01–04 ship. This stage is the ownership rewrite, not a second implementation pass.

## Invariants

- Docs explain ownership and shipped names. They do not copy request/response field lists from `serializers.py`.
- Folder / browse-dir leaves stay documented as server-shaped (`dirs` / `files`).

## Risks

None

## Implementation

### Files

- docs/frontend/conventions.md
- docs/systems/playback.md
- docs/systems/radio.md
- docs/systems/downloads.md
- docs/systems/playback-stats.md
- docs/development/project-structure.md

### Steps

1. `docs/frontend/conventions.md`: artists normalize at the API boundary via `fromApiArtist` in `frontend/src/models/artist.ts` (camel `albumCount`, `preferredRev`, …). Delete the sentence that forbids an Artist mapper and keeps `album_count` / `preferred_rev` on leaves. `BrowseSource` owns list load **and** `loadRoots` / `loadChildren` / `resolveCover`; both hosts call the source. Browse `artUrls` keys are `artist:${id}:thumb` and `cover:${albumId}:thumb`. Stats chrome is not applied inside `LibraryView.load()`. Status face is `PlayStatusState.session` ⊕ source; no `RADIO_EXCLUSIVE_SNAP`.
2. `docs/systems/playback.md`: cover-flip eligibility uses mapped `hasImage` / `hasPreferredImage`. Status line: exclusive face only when `session !== "radio"` and the snap is enabled. `PlaybackStatusLine` uses `layout.ts` for the desktop breakpoint.
3. `docs/systems/radio.md`: room status is `radioPlayState()` (`session: "radio"`). Delete “exclusive snap disabled” / dummy-snap wording.
4. `docs/systems/downloads.md`: `artistImageUrl` busts on nonzero `preferredRev`. Offline list/tree art keys match `art.ts` (`artist:${id}:thumb`, `cover:${albumId}:thumb`).
5. `docs/systems/playback-stats.md`: ranking artists map through `fromApiArtist`; `ListenArtist` is camel (`playCount`, `lastCountedAt`). Delete “Artist list items stay server-shaped” / “Do not widen `ArtistListItem`”.
6. `docs/development/project-structure.md`: `BrowseSource` includes tree load; `LibraryTreePane` does not switch on mode for roots/children/covers.

### Verify

- `rg ArtistListItem docs/frontend docs/systems docs/development` is empty.
- `rg RADIO_EXCLUSIVE_SNAP docs/frontend docs/systems docs/development` is empty.
- `rg 'album_count|fromApiArtist|loadRoots|preferredRev|PlayStatusState' docs/frontend/conventions.md docs/systems/playback.md docs/systems/radio.md docs/systems/downloads.md docs/systems/playback-stats.md docs/development/project-structure.md` shows the new names, not the old “do not add fromApiArtist” / “artists stay snake” sentences.

## Acceptance

- Living docs listed in Files describe camel `Artist` / `fromApiArtist`, `BrowseSource.loadRoots`, art-cache keys, stats-out-of-`load()`, and `session` on `PlayStatusState`.
- Those docs do not mention `ArtistListItem` or `RADIO_EXCLUSIVE_SNAP`.
- Conventions no longer tell the next agent to keep artist leaves snake_case.
