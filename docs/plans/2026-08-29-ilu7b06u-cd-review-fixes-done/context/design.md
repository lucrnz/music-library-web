**Archive.** Decisions in this file were current as of 2026-08-29 (the plan date in the directory name). They may be outdated. Do not treat this as living documentation. This plan directory is an archive.

# CD review fixes

## Goal

Keep the CD software deck (live WAV, third session, no queue stash, lookup vs confirm). Delete the compensating branches the first implementation added: `fingerprint_algo` type-tags in scan/FTS, `PlaylistView` dual-mode, optical watch tied to exclusive `release_device`, MusicBrainz refetch on remember, and identify/hog/reader contracts that the tree had to guess.

## Settled decisions

- **Unripped stubs, not a type-tag.** Confirm still writes album + track rows so listens, Stats, covers, and a later rip have a `tracks.id`. Those rows are marked `unripped` (first-class boolean). Artists/Albums/Search stay empty of them (`track_count` still counts only present files). Stats join those tracks. Do not teach scan/FTS/`count_missing` to string-match `fingerprint_algo == "cd-discid"`.
- **Snapshot on `cd_identities`.** Confirm stores `album_id`, album title, artist, year, `has_cover`, and the applied `tracks[]` (ids + titles). `GET /api/cd/identities/{discid}` is a local read. `POST /api/cd/identify` never writes. If a complete snapshot exists it returns `{ discid, matches: [], applied, cd_text }` and does not call MusicBrainz. Otherwise it looks up and returns `{ discid, matches, applied: null, cd_text }`. Confirm is the only write.
- **Applied DTO** includes `album`, `artist`, `year` (MusicBrainz names). The client must not invent the album title from CD-Text after confirm.
- **Bind / half-bind.** Full bind when the name-keyed album exists and its **present** track count equals the disc’s audio count: use those `tracks.id`, write no stubs. Otherwise `ensure_album` (same name-based id, even if that album already has files) and **half-bind**: reuse a present disc-1/`NULL` track at that number; create an unripped stub only for a hole. Remaster / deluxe collision is accepted.
- **Stub fingerprint.** Unripped rows keep `fingerprint_algo="cd-discid"` / `fingerprint="{discid}:{n}"` as their content id until merge replaces it. That string is a fingerprint, not a policy switch.
- **Listens.** Only real `tracks.id` (bound or stub). `cd:unknown:` and CD-Text-only still never `startCycle`. No `listen_events` schema change.
- **Merge.** A later rip attaches to an unripped hole at the same album + `track_no` (disc 1 / `NULL`). Never replace a present file. Leftover stubs on an occupied slot stay unripped until deleted. Spec: [identity-and-merge.md](identity-and-merge.md).
- **Cover.** Confirm writes Cover Art Archive art onto the album only when `has_cover` is already false. Do not overwrite a ripped folder cover.
- **Migration.** New Alembic deletes today’s `fingerprint_algo="cd-discid"` tracks (listens cascade). Delete `playlist_tracks` rows that reference those ids first if any exist. Delete albums that then have zero tracks. Do not delete artists. Existing `cd_identities` rows without a snapshot are a cache miss until the next confirm.
- **`count_missing`.** Lost files only. Exclude `unripped`.
- **Disc list.** Dedicated `CdTrackList` (or list slot on `CdNowPlaying`). `PlaylistView` is queue-only. Desktop right pane swaps to the CD list while CD is on. Mobile `/cd` shows the list. One `queueActionsAllowed` helper for menus.
- **Store.** `stores/cd.ts` is prefs + live optical + cursor + face. Identify orchestration lives next to `decideIdentify`. Delete `setCdEnterHook` / `setCdMediaGoneHook`. Exclusive reload is Vue `watch`, not `setInterval`. `canShowCdUi` aliases `canShowExclusiveUi`.
- **Watch ≠ hog.** Watch dies on `watch_optical` off, controller loss, and process stop. Not on `release_device`. Not on `stop`. `release_device` only unhogs mpv. Exclusive-off CD keeps the socket and unhogs; the disc watch and CDDA reader stay up.
- **Hog.** `hog` defaults true on the wire. CD sends `hog: isExclusiveEnabled()`. Sink still hard-fails if hog and unarmed. Not `exclusiveArmed` as the load predicate.
- **Reader.** One `CddaReader` per `(device, track)`, reused across Range requests. Cancel in-flight on an out-of-ring seek. Drop on track change / eject / watch-off. HTTP yields sector chunks. The 6 s ring is that reader, not a per-request slurp.
- **Hub.** Move optical watch / list / read / eject / open-gate off `ExclusiveHub` into a sibling module. Hog load stays on the hub.
- **Living docs.** `docs/systems/cd-playback.md` is the durable home. This `design.md` is not.

## Design

```text
confirm
  ├─ full bind?  → present tracks.id
  └─ else half-bind
        ├─ present slot → that tracks.id
        └─ hole         → unripped stub (cd-discid fingerprint)
  ├─ snapshot → cd_identities (local GET / identify.applied)
  └─ CAA cover only if album.has_cover is false

scan of a later rip
  └─ album + track_no is an unripped hole?
        yes → reuse stub id, write content fingerprint, unripped=false
        no  → existing resolve_track

companion
  watch_optical  ── lifetime of media events
  release_device ── unhog only
  GET /cdda      ── one CddaReader per (device, track)
```

Identify stays lookup-only. The PWA still never talks to MusicBrainz. Companion still never opens `library.db`. Queue stash stays forbidden.

Chrome: `App.vue` renders `CdTrackList` in the desktop right pane while `activeSession() === "cd"`; `PlaylistView` does not import the CD store. Mobile `CdView` mounts the same list.

Client identify: `runIdentify` applies `applied` when present; otherwise unique → confirm, several → picker, zero → CD-Text / unknown. No GET after identify.

## Stage map

1. **Identity snapshot + unripped** — schema and server contract everything else hangs on. Reverts the `cd-discid` filters. Client can keep GET until stage 06 (GET becomes local).
2. **Rip merge** — depends on 01 (`unripped` exists). Scan attaches files to holes.
3. **Optical watch + hub extract** — independent of 01. Stops the exclusive-off footgun and takes optical policy off `ExclusiveHub`.
4. **Persistent reader** — depends on 03 only so open/drop live in the extracted module.
5. **CD track list** — independent chrome. Can ship without 01; listed after companion because identity/audio bugs are the production ones.
6. **Client identify + store split** — depends on 01’s `applied` field and album/artist on the DTO.
7. **Living docs** — after the code exists.

## Out of scope

- Ripping UI / Import
- Showing unripped albums in Artists/Albums/Search
- Windows/Linux optical implementation
- Household restream
- Changing bind’s remaster collision (still accepted)
- Lyrics, Downloads, or saved-playlist add for CD rows
- Stats origin chip
- `CONTEXT.md` / a new ADR (the systems page is the durable home)

## Assumptions

- Head Alembic is `015_cd_identity`. This plan adds `016`.
- `listen_events.track_id` stays a required FK. Stub rows satisfy it.
- `album_id_for(artist, title)` is unique: a deluxe and a CD of the same name share an album. Half-bind + “never replace present” is how we live with that.
- Preferred artist images stay sacred; migration does not delete artists.
- Radio and FTS already ignore `is_missing`. Unripped stubs stay `is_missing` until merge, so those paths need no new CD branch.
- `canShowExclusiveUi` and `canShowCdUi` are already the same predicate (Mac installed PWA).
- Domain language beyond `docs/systems/cd-playback.md` is not required.
