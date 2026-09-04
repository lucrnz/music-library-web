**Archive.** Decisions in this file were current as of 2026-09-02 (the plan date in the directory name). They may be outdated. Do not treat this as living documentation. This plan directory is an archive.

# Yellow Book CD-ROM playback

## Goal

Play a macOS Yellow Book data CD (CD-ROM of audio files, with folders) in the existing CD session. Replace today’s dead **Not an audio CD** face with a filesystem browser plus a CD-local queue. Playback is as-is through the companion/mpv. Red Book stays the current TOC + identify deck.

## Settled decisions

- **Platform:** macOS optical CD-ROM only. Windows/Linux stay empty optical + 404. Not DVD, not USB.
- **Occupant:** same `cd` session and gate (installed Mac PWA + companion + Enable CD + drive pick).
- **Red Book:** unchanged track list + MusicBrainz identify. Trailing CD-Extra stays Red Book.
- **Mixed-mode:** Red Book wins whenever an audio session exists (`kind === "audio"`). Filesystem view only when `kind === "data"`.
- **Persistence:** session-only. No SQLite tracks, no scan, no stubs, no import, no write back to the disc.
- **Room (desktop):** right pane splits horizontally — filesystem on top, CD-local queue on the bottom. Resizable; remember height (`musicweb.cdromSplitHeight.v1`).
- **Room (narrow `/cd`):** same two panes stacked, plus CD now-playing. Phones still never show CD UI (`canShowCdUi`).
- **Queue store:** CD-local. Occupant stays `cd`. Library `PlaylistView` / `pl` are untouched. Leave / eject / new disc wipe it. Re-enter keeps queue + shuffle/repeat.
- **Auto-add:** if every playable file lives in exactly one directory (volume root or a single folder), enqueue that directory. Otherwise empty copy: **Add some files to start CD playback**.
- **Verbs:** library on-demand, aimed at the CD queue. File click = `cdromPlayOrQueue` (same start-if-empty-or-paused rule as `playOrQueueTrack`, against `cd` only). File ⋯ = Add. Folder ⋯ = Add all (recursive) + Play all (**replace** CD queue). Folder click = navigate / expand. Volume / current folder: Add all pill; Play all on ⋯.
- **Queue chrome:** on-demand row (title, artist - album, duration, mini cover, ⋯, drag, LossyMark when `isLossy`). Header: Radio + CD toggle, Edit / Clear. No Save, Download, saved-playlist list, or Go to album/artist.
- **Layout:** List / Grid / Tree of the disc filesystem. Tree = directories. Share `musicweb.libraryLayout.v1`. Hide non-audio. List/Grid: Back + current folder title (volume name at root).
- **Labels / icons / sort / extensions:** [disc-files.md](disc-files.md). Playable kinds are only **MP3, AAC (`.aac` / AAC-in-`.m4a`), WMA, ALAC, FLAC**.
- **Playback:** as-is companion HTTP → mpv `load` with the existing hog flag. No transcode. Hog failure on an odd FLAC/ALAC rate is honest (toast + skip), not a secret resample.
- **Covers:** queue + now-playing + Media Session. Embedded, then folder image, then the shipped VA thumb (`/static/img/va-artist-thumb.webp`). Filesystem file icon is that VA thumb; folders use `#i-folder`.
- **LossyMark:** show on filesystem rows, CD queue, and now-playing. `isLossy` is true for MP3 / AAC / WMA, false for ALAC / FLAC, set at walk/probe time. Add `wma` + `fmt-wma` (same text-sprite style as MP3/AAC). Not a `hideLossyMark` prop.
- **Lyrics:** sidecar `.lrc` → embedded tags → LRCLIB via the library server. No `tracks` / `track_lyrics` row. `LyricsOverlay` takes an optional `resolve`; do not teach `resolveLyrics` about `cdrom:`. Always GET `/cdrom/lyrics` first. Memory cache keyed by `cdrom:` id; drop the prefix on leave / eject / new disc. Never write the disc.
- **Now-playing:** existing CD chrome (Leave, Eject, hog, lyrics overlay). No Change disc / MusicBrainz on a data disc.
- **Faces:** `data` and `no_playable` on `CdRoomFace`. Copy: volume name when known; **Data CD** until then (including mount-pending); **No playable audio** after a finished walk with zero allowlisted files. Stop assigning `not_audio` for `kind === "data"`.
- **Live disc:** auto-switch face on kind change. Identity is companion-side `volume_id` (volume UUID / BSD disk), not the name. Same `volume_id` remount is the same disc; a new `volume_id` at the same path rebuilds and re-runs auto-add. Read error: toast + skip to next; stop only if the queue is exhausted. Unmount / eject still clears.
- **Library Play / Play-all / Radio Tune-in:** still leave CD (existing occupant rule).

## Design

**Term:** **Yellow Book** here means a data-session disc the OS mounts as a volume of files. The companion already classifies that as `kind: "data"`. **CD-local queue** is `cd.tracks` while that kind is live — the same cursor Red Book uses for TOC rows, never `stores/playlist.ts`.

**Classify, then mount.** `DarwinOpticalPort.read()` still decides audio vs data from track formats. macOS may classify `kind=data` before `/Volumes/…` exists. After `kind === "data"`, `optical_volume.py` resolves the mount from the BSD device (diskutil / IORegistry). Cache `{ device_id, mount_path, volume_name, volume_id }` where `volume_id` is the volume UUID or the BSD disk behind the mount — not the name. Retry resolve on every watch tick until unmount. Present immediately with an empty listing and face **Data CD**; first successful mount sets `volume_name` and broadcasts. 30s is a still-resolving log/test window, not a give-up. Put `volume_id` in `media_signature` so pending→mounted and same-label swaps broadcast. Broadcast `volume_name` on `optical_media`. Do not put the host path or `volume_id` on the WebSocket.

**Do not TOC-open a mounted data disc every watch tick.** After the first data classify, subsequent watch polls mount presence + `volume_id`, never `port.read()` / `cdio_open`. If `volume_id` changes or the mount vanishes, clear the index and broadcast gone or a new `optical_media` + `cdrom_index`. A failed idle libcdio open must not mean eject (keep last present) — same spirit as today’s idle-read rule.

**Jail.** The companion holds one in-memory tree jailed to that volume. Relative paths are POSIX-style from the volume root. Every list / cover / lyrics / file GET resolves `rel` through that jail (`device` query + `rel` query; never a raw path segment). Windows/Linux stub: no volume, list empty, file routes 404.

**Walk once per media-appeared.** Allowlist from [disc-files.md](disc-files.md). Import `mp4_kind` for `.m4a`; do not copy the probe. Compute `auto_add_rel` (the single audio directory, or null). Client requests `list_cdrom` per folder; filename first, then mutagen. After each folder enrich batch and once when the walk finishes, push `cdrom_list` for that `rel`. Client patches live `cd.tracks` by `rel`. Auto-add uses the completed walk.

**Delivery.** `GET|HEAD /cdrom/file?device=&rel=&token=` streams the original bytes with Range (same token + 127.0.0.1 pattern as `/cdda/` and `/files/`). Call `_require_file_token`: wrong token is **401**; jail / missing / stub / non-allowlist is **404**. `cdTrackUrl` grows a file sibling in `cdDelivery.ts`. `cdLoad` keys the data URL off `track.id` (`cdrom:` prefix), not a `mediaKind` ladder in every chrome file. Hog flag unchanged; `cdLoad` never goes through `exclusiveDelivery`. Play profile is `"cdrom"` for every Yellow Book file (never `"cdda"`, never library `"source"`). Mid-play exclusive toggle reloads the same URL after duration is known. `cdLoad` owns a load generation: fail → toast + `cdNext` only if gen is still current.

**Queue identity.** `Track.id = "cdrom:" + rel`. `path` is the rel. No `albumId` / `artistId`. Media Session and compact status stay on the CD cursor.

**Lyrics.** Companion `GET /cdrom/lyrics` returns sidecar + tag text already on the disc (always try; ignore stale `has_local_lyrics`). `resolveCdromLyrics(trackId)` looks up the `cd.tracks` row and is passed as `LyricsOverlay`’s optional `resolve`. Then `POST /api/cd/lyrics` (title / artist / album / duration) runs the existing LRCLIB client and does not write `track_lyrics`. Reuse `peekLyricsMemory` (export `dropLyricsMemory`); do not add a second lyrics `Map`.

**UI host.** Desktop `App.vue` mounts a Yellow Book pane instead of `CdTrackList` when `mediaKind === "data"`. Red Book still mounts `CdTrackList`. Narrow `CdView` stacks filesystem + queue. Split height lives next to the library pane-width pref.

## Stage map

Stage 01 is the companion volume + jailed walk. Nothing else can list or auto-add without a mount that watch will not smash.

Stage 02 depends on 01’s jail. It is the as-is byte path mpv already knows how to `load`.

Stage 03 depends on 01’s tree. Tags, covers, and disc-local lyrics enrich listings; covers reuse the 02 HTTP token pattern.

Stage 04 depends on 01–03. It is the client cursor: `startCdromSession` (enter + kind edge), faces `data` / `no_playable`, auto-add, `cdromPlayOrQueue` / replace, `cdLoad` file URLs + load generation, skip-on-error, `isLossy` / `fmt-wma` / shipped VA thumb. Desktop still mounts `CdTrackList` as a dumb `cd.tracks` list (no Change disc). Tests own the verbs.

Stage 05 depends on 04. It is the visible room (desktop split, narrow stack, List/Grid/Tree, dedicated CD rows, private tree type, queue chrome, LossyMark on the three surfaces).

Stage 06 depends on 04 (current row tags) and 05 (now-playing in that room). LRCLIB + lyrics overlay. Independent of Red Book identify.

Stage 07 depends on 05–06 so living docs describe what landed. Durable decisions move to `docs/systems/` and friends — not this plan directory.

## Out of scope

- Windows / Linux optical implementation
- DVD-ROM, Blu-ray, USB sticks, arbitrary folder player
- Dual-mode switcher on mixed-mode / Enhanced CDs
- Ripping, import, library bind, unripped stubs for data files
- Indexing WMA (or any Yellow Book-only kind) into the library
- Playing Vorbis, Opus, WAV/AIFF, APE, WavPack, DSD, or `.mp4` on a data disc
- Transcoding Yellow Book files (including to make exclusive hog work)
- Household restream
- CUE sheets, M3U/PLS as playlists, video containers
- Download-to-locker, save-as-playlist, Go to album/artist
- Change disc / MusicBrainz for data discs
- DiskArbitration / IOKit rewrite of drive **identity** keys
- Gapless whole-disc concat, analog MMC, custom `cdda://`
- iOS / Safari / Firefox clients

## Assumptions

- macOS will mount a typical ISO9660 / Joliet / HFS data CD at `/Volumes/{name}` when the tray has media, and that mount is readable by the companion process. Classify can precede the mount; a replacement disc may remount at the same path with a different `volume_id`.
- A SuperDrive data CD of a few hundred allowlisted files can be walked and tag-read on insert without a progress UI.
- Exclusive hog of high-rate FLAC/ALAC may fail; that is acceptable.
- Library server LRCLIB is reachable from the same LAN as today’s scan lyrics; the companion does not call LRCLIB.
- Red Book `/cd` handoff and `CdMini` stay; Yellow Book reuses them with the new stacked body.
