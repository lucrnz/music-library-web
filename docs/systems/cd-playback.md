# CD playback

Software deck for a Red Book audio CD on an installed Mac Desktop PWA with the Desktop companion. The disc is the file: live sector reads become a loopback WAV for stock mpv. There is no rip UI, no write into the library tree as audio files, and no household restream.

## Gating

Only an installed Mac Chromium PWA shows CD chrome and Settings. The companion may connect when CD is enabled (token required). Windows/Linux companions expose an empty optical list and 404 the WAV route so a later Windows reader is not a rewrite. Phones and browser tabs never show CD UI.

## Settings and watch

Enable CD playback and pick an optical drive. The preference stays if the drive disappears (“drive missing”). The companion lists drives whenever CD is enabled. Media-appeared / media-gone is watched only while the setting is on **and** CD mode is on.

Watch lifetime is `watch_optical` on/off, controller loss, and process stop. `release_device` only unhogs mpv. Exclusive-off CD keeps the socket and unhogs; the disc watch and CDDA reader stay up.

## Session

CD is a third occupant (`none` | `queue` | `radio` | `cd`). The on-demand queue is never occupied or stashed. Disc rows live on a CD cursor (`frontend/src/stores/cd.ts`). The disc list is `CdTrackList` (desktop right pane while CD is on; mobile `/cd`). `PlaylistView` is queue-only. Leave = CD button off, a library Play / Play-all, or Radio Tune-in. Stop / headset Stop = pause and stay in CD.

While CD is on, `queueActionsAllowed()` is false (hide add-to-queue / play-next / play-last). Play / Play-all still leave CD and play the library action.

## Identify

Companion reads TOC + CD-Text. The library server computes the MusicBrainz disc id. `POST /api/cd/identify` never writes. If a complete `cd_identities` snapshot exists it returns `{ discid, matches: [], applied, cd_text }` and does not call MusicBrainz. Otherwise it looks up and returns `{ discid, matches, applied: null, cd_text }`. Unique hit → client confirms without a picker. Several hits → blocking picker. `GET /api/cd/identities/{discid}` is a local snapshot read. Confirmed MusicBrainz titles win (`applied.album` / `artist` / `year`). Unknown discs use session-only `cd:unknown:{n}` rows. CD-Text-only never writes server rows.

Full bind when the name-keyed album exists and its present track count equals the disc. Otherwise half-bind: reuse a present slot at that track number; create an `unripped` stub only for a hole. Confirm writes Cover Art Archive art only when the album has no cover yet.

Unripped stubs are first-class (`tracks.unripped`). They stay out of Artists/Albums/Search (`track_count` counts present files). Stats and the CD screen use them. Scan/FTS/`count_missing` do not string-match `fingerprint_algo`. A later rip attaches to an unripped hole at the same album + track number and never replaces a present file.

## Audio

Companion serves a token-gated loopback WAV per track. One `CddaReader` per `(device, track)` is reused across Range requests. mpv `load`s that HTTP URL. `load` takes an explicit **hog** flag: exclusive on → hog (hard-fail if unarmed); exclusive off → auto output. Mid-play exclusive toggle reloads the same URL at the same position (Vue `watch`, not a timer). Correction is libcdio-paranoia overlap+verify with a 6 s RAM ring. Status face while CD is on includes Reading / Detecting / Playing / No disc / Drive missing / Companion offline.

Eject stops transport and asks the companion to eject. Failure toasts; stay in the room if media is still present.

## Listens

Only MusicBrainz-identified plays (bound or unripped `tracks.id`). `origin=cd`, `play_source=cd`, profile `cdda`. Track N / CD-Text-only never start a listen cycle. Rankings stay mixed (no Stats chip). `count_missing` excludes unripped stubs.

## Out of scope

Ripping UI / Import, showing unripped albums in Artists/Albums/Search, data-session / CD-ROM file playback, Windows/Linux optical implementation, household restream, analog MMC play-out, custom mpv `cdda://`, gapless whole-disc concat, manual tagger, lyrics/downloads/saved-playlist add for CD rows.

## Source of truth

- Companion optical + WAV: `src/musicweb/exclusive/optical.py`, `optical_cdio.py`, `optical_session.py`, `cdda_stream.py`
- Server identity: `src/musicweb/cd/`
- Client store + chrome: `frontend/src/stores/cd.ts`, `frontend/src/cd/identifyFlow.ts`, `frontend/src/components/cd/`, `frontend/src/playback/cdLoad.ts`
