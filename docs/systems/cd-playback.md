# CD playback

Software deck for a Red Book audio CD on an installed Mac Desktop PWA with the Desktop companion. The disc is the file: live sector reads become a loopback WAV for stock mpv. There is no rip UI, no write into the library tree as audio files, and no household restream.

## Gating

Only an installed Mac Chromium PWA shows CD chrome and Settings. The companion may connect when CD is enabled (token required). Windows/Linux companions expose an empty optical list and 404 the WAV route so a later Windows reader is not a rewrite. Phones and browser tabs never show CD UI.

## Settings and rematch

Enable CD playback and pick an optical drive. The preference is a hardware key (libcdio vendor+model) plus the last BSD id. Each drive list remaps that key to the current device path. Two listed drives with the same key and a vanished last id stay Drive missing (do not auto-pick). An empty SuperDrive list keeps the stored key and last id and surfaces Drive missing. Disabling CD keeps the last pick. The preference is cleared only when the user picks another drive. Exact query and key strings live in `frontend/src/playback/cdDelivery.ts` and `src/musicweb/exclusive/optical.py`.

## Watch

The companion lists drives whenever CD is enabled. Media-appeared / media-gone is watched only while the setting is on **and** CD mode is on.

Watch lifetime is `watch_optical` on/off, controller loss, and process stop. `release_device` only unhogs mpv. Exclusive-off CD keeps the socket and unhogs; the disc watch and CDDA reader stay up. Companion hello and a rematched drive id re-send watch while the session is still cd.

The watch does not TOC-open the selected device while a `CddaReader` is live. A failed idle read never means eject (keep last present). Physical eject / unplug while playing surfaces via the WAV/mpv error path, then one idle read. `eject` drops the reader first, then the ioctl. Missing `libcdio-paranoia` is an `optical_error`, not a silent WAV 404.

A disc with no Red Book audio session is face **Not an audio CD**, not No disc. Trailing CD-Extra stays playable.

## Session

CD is a third occupant (`none` | `queue` | `radio` | `cd`). The on-demand queue is never occupied or stashed. Disc rows live on a CD cursor (`frontend/src/stores/cd.ts`). The disc list is `CdTrackList` (desktop right pane while CD is on; mobile `/cd`). `PlaylistView` is queue-only.

The desktop CD icon is a **session toggle**: first press enters CD and opens the rail; second press leaves (`become("none")`), stops transport, stops watch, and restores the queue pane. Collapse / X only hides the now-playing rail and **keeps** the session. A collapsed desktop session or a Library tab shows `CdMini` (transport + Leave), never queue Play / Next.

A narrow window (`<900px`) does not leave. The CD tab opens `/cd` and enters. Switching to Library / Playlist / Radio keeps the session. Shrinking a desktop CD session hands off to `/cd` the way radio hands off to `/radio`. Leave from the CD room and from the mini. Library Play / Play-all and Radio Tune-in still leave. Stop / headset Stop = pause and stay in CD.

Re-entering an already-cd session only opens the rail and ensures watch — it does not reset shuffle/repeat or re-identify.

While CD is on, `queueActionsAllowed()` is false (hide add-to-queue / play-next / play-last / Add all). Play / Play-all still leave CD and play the library action.

## Identify

Companion reads TOC + CD-Text (Latin-1, with an MS-JIS guess for Japanese pressings). The library server computes the MusicBrainz disc id. `POST /api/cd/identify` never writes. If a complete `cd_identities` snapshot exists it returns that snapshot and does not call MusicBrainz, unless the client sends `force` (Change disc). Then it looks up and returns matches. Unique hit → client confirms without a picker. Several hits → blocking picker. Identify then confirm share one process-wide MusicBrainz HTTP client. `GET /api/cd/identities/{discid}` is a local snapshot read. Confirmed MusicBrainz titles win (`applied.album` / `artist` / `year`). Unknown discs use session-only `cd:unknown:{n}` rows. CD-Text-only never writes server rows.

Lookup picks the medium whose disc id matches. If the medium position is greater than 1, confirm always writes unripped stubs and never reuses present disc-1 / `NULL` slots (no disc-1 theft). No `disc_no` column: a later rip of disc 2 still will not merge onto those stubs. Full bind still requires a name-keyed album whose present track count equals the disc **and** medium position 1. Otherwise half-bind: reuse a present slot at that track number on medium 1; create an `unripped` stub only for a hole. Confirm writes Cover Art Archive art only when the album has no cover yet.

Apply keeps the current cursor when that track number is still present, and can start a listen cycle if the playing row just gained a real `tracks.id`.

Unripped stubs are first-class (`tracks.unripped`). They stay out of Artists/Albums/Search (`track_count` counts present files). Stats and the CD screen use them. Scan/FTS/`count_missing` do not string-match `fingerprint_algo`. A later rip attaches to an unripped hole at the same album + track number and never replaces a present file.

## Audio

Companion serves a token-gated loopback WAV per track. The device path is a query argument, never a URL path segment (see `cdDelivery.ts` / `app.py`). One `CddaReader` per `(device, track)` is reused across Range requests. Paranoia reads sectors sequentially (seek once per prime). mpv `load`s that HTTP URL. `load` takes an explicit **hog** flag: exclusive on → hog (hard-fail if unarmed); exclusive off → auto output. Mid-play exclusive toggle reloads the same URL and seeks only after duration is known. Correction is libcdio-paranoia overlap+verify with a 6 s RAM ring. Volume is a `subscribeOutputVolume` on the CD sink. Media Session metadata and position come from the CD cursor, not the queue. Status face while CD is on includes Reading / Detecting / Playing / No disc / Drive missing / Companion offline / Not an audio CD.

Companion STATUS `url` and mpv stderr never carry the raw query token.

Eject stops transport and asks the companion to eject. Failure toasts; stay in the room if media is still present.

## Listens

Only MusicBrainz-identified plays (bound or unripped `tracks.id`). `origin=cd`, `play_source=cd`, profile `cdda`. Track N / CD-Text-only never start a listen cycle. Rankings stay mixed (no Stats chip). `count_missing` excludes unripped stubs.

## Out of scope

Ripping UI / Import, showing unripped albums in Artists/Albums/Search, data-session / CD-ROM file playback, Windows/Linux optical implementation, household restream, analog MMC play-out, custom mpv `cdda://`, gapless whole-disc concat, manual tagger, lyrics/downloads/saved-playlist add for CD rows, DiskArbitration / IOKit location rewrite, `disc_no` on stubs and rip-merge of disc 2, Stats origin chip.

## Source of truth

- Companion optical + WAV: `src/musicweb/exclusive/optical.py`, `optical_cdio.py`, `optical_session.py`, `cdda_stream.py`, `app.py`
- Server identity: `src/musicweb/cd/`
- Client store + chrome: `frontend/src/stores/cd.ts`, `frontend/src/cd/identifyFlow.ts`, `frontend/src/components/cd/`, `frontend/src/playback/cdLoad.ts`, `frontend/src/playback/cdDelivery.ts`
