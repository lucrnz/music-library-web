**Archive.** Decisions in this file were current as of 2026-08-29 (the plan date in the directory name). They may be outdated. Do not treat this as living documentation. This plan directory is an archive.

# Mac PWA CD playback repair

## Goal

Make the installed Mac Chromium PWA software CD deck actually play a SuperDrive / USB optical disc, then make the occupant chrome, watch, identify, and listens match `docs/systems/cd-playback.md` without a rip UI, a `disc_no` schema, or a DiskArbitration rewrite.

## Settled decisions

- **Full audit.** This plan covers every issue from the 2026-08-29 Mac PWA CD audit: WAV routing, drive identity, watch/eject, paranoia/CD-Text, session chrome, transport honesty, identify/listens, leftover polish. Staged so Mac sound works first.
- **WAV URL is query-shaped.** `GET /cdda/{track_no}?device=…&token=…`. The BSD node is never a path segment. Replace the old `/cdda/{device_id}/{track_no}` route; no other client exists.
- **Hardware key + rematch.** Persist vendor+model from libcdio hwinfo (`musicweb.cd.driveKey`) plus the last BSD id. Each drive list remaps to the current `/dev/rdiskN`. Two identical keys and a vanished id → Drive missing (do not auto-pick). Empty SuperDrive that libcdio does not list keeps the preference and surfaces Drive missing. No DiskArbitration / IOKit location rewrite this plan.
- **Idle poll, honest gone.** Do not TOC-open the watched device while a `CddaReader` is live. A failed `read` never means eject (keep last present). Physical eject / unplug while playing surfaces via the WAV/mpv error path, then one idle read. Drop the reader **before** `eject`. Companion reconnect and Settings drive change re-send `watch_optical` when CD mode is on. Missing `libcdio-paranoia` is `optical_error`, not a silent WAV 404.
- **Desktop CD icon is a session toggle.** First press enters CD and opens the rail. Second press leaves (`become("none")`), stops transport, stops watch, restores the queue pane. Collapse / X only hides the now-playing rail and **keeps** the session.
- **Narrow tab does not leave.** `<900px` CD tab opens `/cd` and enters. Switching to Library / Playlist / Radio keeps the session. A CD mini keeps transport. Leave from the CD room and from the mini. Library Play-all and Radio Tune-in still leave. Shrinking a desktop CD session hands off to `/cd` the way radio hands off to `/radio`.
- **Identify: matching medium, no disc-1 theft.** MusicBrainz lookup uses discids and picks the medium whose disc id matches. Medium position > 1 always writes unripped stubs and never reuses present disc-1/`NULL` slots. No new `disc_no` schema. A later rip of disc 2 still will not merge onto those stubs (accepted leftover).
- **Change disc force-looks-up.** `POST /api/cd/identify` accepts `force`. When true, skip the snapshot short-circuit and call MusicBrainz. Confirm still overwrites `cd_identities`. Unique hit still auto-confirms. Several hits still open the picker.
- **One process-wide MusicBrainz HTTP client.** Identify then confirm share the existing `RateLimitedHttp` interval. Do not construct a fresh limiter per call.
- **Apply keeps the cursor and can start a listen.** `setCdTracks` on apply does not snap to 0 when the same track number is still present. If that row just gained a real `tracks.id` and transport is already on that index, `startCycle` then (still never for `cd:unknown:`).
- **CD-Text:** decode as Latin-1; if the bytes look like MS-JIS, use that. A TOC with no Red Book audio session is face **Not an audio CD**, not No disc. Trailing CD-Extra stays playable.
- **Token stays off logs and STATUS.** Companion `status` `url` and mpv stderr must not carry `?token=`.
- **Living docs.** Durable home remains `docs/systems/cd-playback.md`. This `design.md` is not.

## Design

```text
PWA  -- GET /cdda/{n}?device=/dev/rdiskN&token= --  companion
         watch_optical on selected BSD id
         (no TOC open while CddaReader live)

Settings persist driveKey = vendor|model
list_optical_drives remaps key → current rdisk

session cd
  desktop CD icon     = enter / leave
  collapse / X        = hide rail, stay cd
  mobile /cd tab      = enter, tab away stays
  CdMini / bar        = transport + Leave

identify
  force? → skip snapshot
  pick media[i] where discs[].id == discid
  medium > 1 → stubs only
  apply → keep index → maybe startCycle
```

**Companion** still never opens `library.db`. Optical list/watch/eject stay controller-only. Hog `load` is unchanged (`hog: isExclusiveEnabled()`).

**Server** still never sees the optical device. Identify stays lookup-only unless `force` (still no write). Confirm is the only write.

**Client** owns chrome, rematch, watch restart, Media Session metadata, and volume on the CD sink. `player.ts` still does not import `cd.ts`. Queue stash stays forbidden.

Hardware key is hwinfo only. libcdio’s empty-tray list can still be empty; that is Drive missing, not a DA project.

Disc-2 Stats attach to unripped stubs. Rip-merge of disc 2 is a later schema plan.

## Stage map

1. **Query WAV URL** — nothing else matters if mpv 404s `/dev/rdiskN`. Independent of chrome.
2. **Hardware drive key** — Settings and watch need a stable pick before idle-watch policy is useful after eject.
3. **Idle watch + eject + reconnect** — depends on a rematched BSD id from 02. Stops fake media-gone and busy eject.
4. **Paranoia sequential + CD-Text + driver enums** — same reader/port as 03; after eject/drop so tests are not fighting a busy handle.
5. **Session chrome** — independent of 04. After 01 so a manual Mac check can play while using the new occupant.
6. **Deck transport** — volume, Media Session, seek-after-duration, covers, library Play / Add-all. Needs 05’s mini/bar to exist.
7. **Identify + listens** — independent of chrome; after 01 so a confirmed disc can be played. Uses 05’s “do not re-identify on re-enter.”
8. **Living docs** — after the code exists.

## Out of scope

- Ripping / Import UI
- Showing unripped albums in Artists / Albums / Search
- Windows / Linux optical implementation
- Household restream
- DiskArbitration / IOKit location rewrite
- `disc_no` on stubs and rip-merge of disc 2
- Lyrics, Downloads, or saved-playlist add for CD rows
- Stats origin chip
- Changing exclusive’s no-HTML-fallback rule
- iOS / Safari / Firefox

## Assumptions

- Operator already runs `musicweb companion` with Homebrew `libcdio` + `libcdio-paranoia` as optional deps. Missing paranoia must be an explicit optical error after this plan.
- One SuperDrive / one USB optical is the common case. Two drives with the same vendor+model string is Drive missing until the user re-picks.
- `MUSICBRAINZ_CONTACT_EMAIL` is still required for lookup; unset still means `matches: []`.
- Head Alembic stays `016_cd_unripped`. This plan adds no migration.
- `docs/systems/cd-playback.md` is updated only in stage 08.
