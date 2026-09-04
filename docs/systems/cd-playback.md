# CD playback

Software deck for a Mac optical disc on an installed Desktop PWA with the Desktop companion. There is no rip UI, no write into the library tree as audio files, and no household restream.

**Red Book** (audio session) is the live-sector WAV deck plus MusicBrainz identify. **Yellow Book** (data session, `kind === "data"`) is a jailed filesystem of allowlisted files plus a CD-local queue. Mixed-mode / Enhanced CDs stay Red Book whenever an audio session exists. The old data-disc face **Not an audio CD** is replaced by `data` / `no_playable`.

## Gating

Only an installed Mac Chromium PWA shows CD Settings. The desktop session toggle and the mobile CD tab appear only when Enable CD playback is on **and** a drive is picked; Drive missing does not hide them. Disabling CD, or having no pick, leaves a live CD session. The companion may connect when CD is enabled (token required). Windows/Linux companions expose an empty optical list and 404 the WAV and `/cdrom/*` routes so a later Windows reader is not a rewrite. Phones and browser tabs never show CD UI.

## Settings and rematch

Enable CD playback and pick an optical drive. The preference is a hardware key (libcdio vendor+model) plus the last BSD id. Each drive list remaps that key to the current device path. Two listed drives with the same key and a vanished last id stay Drive missing (do not auto-pick). An empty SuperDrive list keeps the stored key and last id and surfaces Drive missing. Disabling CD keeps the last pick. The preference is cleared only when the user picks another drive. Exact query and key strings live in `frontend/src/playback/cdDelivery.ts` and `src/musicweb/exclusive/optical.py`.

## Watch

The companion lists drives whenever CD is enabled. Media-appeared / media-gone is watched only while the setting is on **and** CD mode is on.

Watch lifetime is `watch_optical` on/off, controller loss, and process stop. `release_device` only unhogs mpv — it does not tear down watch or the CDDA reader. Exclusive-off CD `load` starts mpv; leave / `stop` with no hog device quits the child. Watch is independent of that process. Exclusive-off CD keeps the socket and unhogs; the disc watch and CDDA reader stay up. Companion hello and a rematched drive id re-send watch while the session is still cd.

The watch does not TOC-open the selected device while a `CddaReader` is live. A failed idle read never means eject (keep last present). Physical eject / unplug while playing surfaces via the WAV/mpv error path, then one idle read. `eject` drops the reader first, then the ioctl. Missing `libcdio-paranoia` is an `optical_error`, not a silent WAV 404.

A data-session disc is face **Data CD** (or the volume name once mounted), not No disc. After a finished walk with zero allowlisted files the face is **No playable audio**. Trailing CD-Extra stays Red Book. After the first data classify, watch polls mount presence + `volume_id` and does not TOC-open the raw device. Classify can precede `/Volumes`; the companion retries the mount each tick (30s is a log window, not a give-up). Identity is companion-side `volume_id` (volume UUID / BSD disk), not the volume name — a new id at the same path is a new disc. Host paths and `volume_id` never appear on the WebSocket.

## Session

CD is a third occupant (`none` | `queue` | `radio` | `cd`). The on-demand queue is never occupied or stashed. Disc rows live on a CD cursor (`frontend/src/stores/cd.ts`). Red Book mounts `CdTrackList`. Yellow Book mounts a split filesystem + CD-local queue (`CdRomPane` desktop; stacked on narrow `/cd`). That queue is not `PlaylistView` / `pl`. `PlaylistView` stays queue-only.

The desktop CD icon is absent until Enable CD playback is on and a drive is picked. Once shown it is a **session toggle**: first press enters CD and opens the rail; second press leaves (`become("none")`), stops transport, stops watch, and restores the queue pane. Collapse / X only hides the now-playing rail and **keeps** the session. A collapsed desktop session or a Library tab shows `CdMini` (transport + Leave), never queue Play / Next.

A narrow window (`<900px`) does not leave. The CD tab (same Enable + drive gate) opens `/cd` and enters. `/cd` without that gate replaces to the last library URL. Switching to Library / Playlist / Radio keeps the session. Shrinking a desktop CD session hands off to `/cd` the way radio hands off to `/radio`. Leave from the CD room and from the mini. Library Play / Play-all and Radio Tune-in still leave. Stop / headset Stop = pause and stay in CD.

Re-entering an already-cd session only opens the rail and ensures watch — it does not reset shuffle/repeat or re-identify.

While CD is on, `queueActionsAllowed()` is false (hide add-to-queue / play-next / play-last / Add all). Play / Play-all still leave CD and play the library action.

## Identify

Companion reads TOC + CD-Text (Latin-1, with an MS-JIS guess for Japanese pressings). The library server computes the MusicBrainz disc id. `POST /api/cd/identify` never writes. If a complete `cd_identities` snapshot exists it returns that snapshot and does not call MusicBrainz, unless the client sends `force` (Change disc). Then it looks up and returns matches. Unique hit → client confirms without a picker. Several hits → blocking picker. Identify then confirm share one process-wide MusicBrainz HTTP client. `GET /api/cd/identities/{discid}` is a local snapshot read. Confirmed MusicBrainz titles win (`applied.album` / `artist` / `year`). Unknown discs use session-only `cd:unknown:{n}` rows. CD-Text-only never writes server rows.

Lookup picks the medium whose disc id matches. If the medium position is greater than 1, confirm always writes unripped stubs and never reuses present disc-1 / `NULL` slots (no disc-1 theft). No `disc_no` column: a later rip of disc 2 still will not merge onto those stubs. Full bind still requires a name-keyed album whose present track count equals the disc **and** medium position 1. Otherwise half-bind: reuse a present slot at that track number on medium 1; create an `unripped` stub only for a hole. Confirm writes Cover Art Archive art only when the album has no cover yet.

Apply keeps the current cursor when that track number is still present.

Unripped stubs are first-class (`tracks.unripped`). They stay out of Artists/Albums/Search (`track_count` counts present files). The CD screen uses them; a later rip merge attaches to an unripped hole at the same album + track number and never replaces a present file. Scan/FTS/`count_missing` do not string-match `fingerprint_algo`.

## Audio

Companion serves a token-gated loopback WAV per Red Book track. The device path is a query argument, never a URL path segment (see `cdDelivery.ts` / `app.py`). One `CddaReader` per `(device, track)` is reused across Range requests. Paranoia reads sectors sequentially (seek once per prime). mpv `load`s that HTTP URL. `load` takes an explicit **hog** flag: exclusive on → hog (hard-fail if unarmed); exclusive off → auto output. Mid-play exclusive toggle reloads the same URL and seeks only after duration is known. Correction is libcdio-paranoia overlap+verify with a 6 s RAM ring. Volume is a `subscribeOutputVolume` on the CD sink. Media Session metadata and position come from the CD cursor, not the queue. Status face while CD is on includes Reading / Detecting / Playing / No disc / Drive missing / Companion offline / Data CD / volume name / No playable audio.

Companion STATUS `url` and mpv stderr never carry the raw query token.

Eject stops transport and asks the companion to eject. Failure toasts; stay in the room if media is still present.

## Yellow Book

macOS data CDs only. Windows/Linux stay empty optical + 404. Not DVD, USB, or an arbitrary folder player.

The companion holds one in-memory tree jailed to that volume. Relative paths are POSIX-style from the volume root. Every list / cover / lyrics / file GET resolves `rel` through that jail (`device` + `rel` + `token` query; never a raw path segment). Walks a closed allowlist (**MP3**, **AAC** (`.aac` / AAC-in-`.m4a`), **WMA**, **ALAC**, **FLAC**). Wrong token is **401**; jail miss / missing file / stub / non-allowlist is **404**. Playback is as-is: `cdLoad` keys data rows off `cdrom:` ids (`path` is the rel, no `albumId` / `artistId`), profile `"cdrom"`, never `/cdda/` and never `exclusiveDelivery`. Hog still wraps that URL; a high-rate FLAC/ALAC hog failure is honest (toast + skip). A read/load error toasts and skips to the next row; stop only when the queue is exhausted. Session-only: no SQLite tracks, no scan, no import, no write back to the disc.

Auto-add enqueues the single directory that holds every playable file; two or more parent folders leave the CD-local queue empty (**Add some files to start CD playback**). Leave / eject / new disc wipe that queue; re-enter of an already-cd session keeps queue + shuffle/repeat. Same `volume_id` remount is the same disc; a new `volume_id` at the same path rebuilds and re-runs auto-add. Desktop split is filesystem on top, CD-local queue on the bottom (resizable, `musicweb.cdromSplitHeight.v1`). File click starts only when that queue is empty or paused; file ⋯ is Add; folder ⋯ is Add all + Play all (**replace**). Queue chrome is the on-demand row plus Radio/CD + Edit/Clear — no Save, Download, or Go to. Filesystem chrome is List/Grid/Tree (`ui.libraryLayout`; hide non-audio; Back + folder title, volume name at root), dedicated `CdRomFileRow` / `CdRomFolderRow`, and a private tree type — not `TrackRow`, `AlbumCard`, or library `TreeNode`. File icon is the shipped VA thumb; folders use `#i-folder`. Queue / now-playing / Media Session covers are embedded, then a folder image, then that VA thumb. LossyMark shows on filesystem rows, the CD-local queue, and now-playing for MP3 / AAC / WMA (`fmt-wma` matches the MP3/AAC text sprite). ALAC / FLAC have no mark. Data-disc now-playing has no Change disc / MusicBrainz.

Lyrics: always GET `/cdrom/lyrics` first (sidecar `.lrc` then embedded tags), then library-server LRCLIB by title/artist/album/duration. `LyricsOverlay` takes an optional `resolve`; do not teach `resolveLyrics` about `cdrom:`. No `tracks` / `track_lyrics` row. Memory cache is keyed by the `cdrom:` id and dropped on leave / eject / new disc.

## Out of scope

Ripping UI / Import, showing unripped albums in Artists/Albums/Search, Windows/Linux optical implementation, DVD-ROM / Blu-ray / USB sticks, mixed-mode switcher, household restream, analog MMC play-out, custom mpv `cdda://`, gapless whole-disc concat, manual tagger, indexing WMA (or any Yellow Book-only kind) into the library, transcoding Yellow Book files, DiskArbitration / IOKit **identity** rewrite, `disc_no` on stubs and rip-merge of disc 2.

## Source of truth

- Companion optical + WAV + jailed CD-ROM: `src/musicweb/exclusive/optical.py`, `optical_cdio.py`, `optical_session.py`, `optical_volume.py`, `optical_fs.py`, `optical_meta.py`, `cdda_stream.py`, `app.py`
- Server identity + CD LRCLIB: `src/musicweb/cd/`, `src/musicweb/lyrics/lookup.py`, `src/musicweb/routes/cd.py`
- Client store + chrome: `frontend/src/stores/cd.ts`, `frontend/src/cd/`, `frontend/src/components/cd/`, `frontend/src/playback/cdLoad.ts`, `frontend/src/playback/cdDelivery.ts`
