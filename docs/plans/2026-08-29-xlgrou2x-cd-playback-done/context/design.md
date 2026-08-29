**Archive.** Decisions in this file were current as of 2026-08-29 (the plan date in the directory name). They may be outdated. Do not treat this as living documentation. This plan directory is an archive.

# CD playback and disc identification

## Goal

Let an installed Mac Desktop PWA play a Red Book audio CD through the Desktop companion as a software deck — live sector reads into the existing mpv path, not a rip-to-temp — and identify the disc the way classic iTunes did (TOC → MusicBrainz, plus CD-Text), with a blocking picker when several releases match.

## Settled decisions

- **Gating.** Installed Mac Chromium PWA + Desktop companion only. Phones and non-installed tabs never show CD chrome. Windows/Linux ship an empty optical interface (list none, no playback) so a later Windows reader is not a rewrite.
- **This Mac only.** The disc is never restreamed to other household clients. Radio remains the multi-device feature.
- **No rip.** No write into the library tree. No data-session / CD-ROM file playback (FLAC/MP3/AAC on a disc is a later plan). Enhanced/CD-Extra: play the audio TOC, ignore the data session. SACD/DVD-A out.
- **Settings.** “Enable CD playback” + optical-drive dropdown. Persist preference in PWA `localStorage` (`musicweb.cd.enabled`, `musicweb.cd.driveId`) like exclusive device pick. No auto-pick. Keep the preference if the drive disappears; surface “drive missing.” Clear only when the user picks another drive or disables the setting.
- **Watch.** Companion may connect when CD is enabled (so Settings can list drives). Media-appeared / media-gone is watched only while the setting is on **and** CD mode is on. Event is “media appeared on the selected device,” not tray-close. Implementation: poll the selected libcdio device (~1 s) while watch is on (cross-platform; DiskArbitration is not required this plan).
- **CD mode.** A third session occupant (`none` | `queue` | `radio` | `cd`). The on-demand queue (`playlist.ts` / `musicweb.playlist.v1`) is **never occupied, stashed, or restored**. Disc rows live on a CD cursor (`tracks` / `index` / `shuffle` / `repeat`) on one `stores/cd.ts`. The playlist pane and `/cd` are views of that cursor when `activeSession() === "cd"`. Leave = CD button off, a library **Play** / Play-all, or Radio Tune-in → stop CD audio, clear the CD cursor, stop the watcher; the on-demand queue is whatever it already was. Collapsing the rail keeps mode.
- **Disc list is the TOC.** No remove, drag-reorder, or add-to-this-list. Shuffle/repeat are play-order flags on the cursor (both start `off` on enter).
- **Queue mutations while CD is on.** Disable add-to-queue, play-next, and play-last. Play / Play-all still leave CD and run on the real queue.
- **Stop vs leave vs eject.** Stop and Media Session stop = **pause**; stay in CD. Leave is only the CD button, a library Play/Play-all, or Tune-in. An **Eject** control on the CD room stops transport, asks the companion to eject the selected drive, then follows media-gone (clear cursor, **No disc**, stay in the room). Eject ioctl failure: already stopped; toast; if media is still present keep the paused list.
- **Chrome.** Desktop (≥900px): icon beside Radio in the playlist header. Mac PWA <900px: fourth tab (Library | Playlist | Radio | CD) and `/cd` (unmount library+playlist like `/radio`). The button always opens the CD surface; blockers (setting off, no drive, companion down, libcdio missing, no disc) are explained inside.
- **Never auto-play.**
- **Identify contract.** `POST /api/cd/identify` is **lookup only** (never writes `cd_identities`, tracks, or covers). Unique match → client `POST /api/cd/confirm` without opening the picker. Remembered disc → `GET /api/cd/identities/{discid}` applies that payload, no picker. Several hits → blocking picker; dismiss does not confirm. Confirm and GET return the same applied DTO (`discid`, `release_mbid`, `album_id`, `has_cover`, `tracks[]` with real `tracks.id`). Spec: [disc-identity.md](disc-identity.md).
- **Identify display.** Companion reads TOC + CD-Text. Server computes the MusicBrainz disc id and queries MusicBrainz + Cover Art Archive using `MUSICBRAINZ_CONTACT_EMAIL`. Unset email → `matches: []`. Confirmed MB release wins titles/artist/album/cover. CD-Text fills holes and is the offline / no-MB display. Picker shows album, artist, year, country, label, track count; Track N (or CD-Text) is already listed behind it. “Change disc…” re-opens the picker and overwrites the server memory. No free-text tagger. No “search MB by name” this plan.
- **Unknown disc.** Track 1…N, Unknown Artist, generic Audio CD art. Session-only rows with sentinel ids `cd:unknown:{n}`. Never persist. Never `startCycle`. `isMissing: false` in the room.
- **CD-Text-only (no MB hit).** Display CD-Text in the room. Do **not** write server rows. Do **not** log listens.
- **Library write (MB unique or user-confirmed only).** Bind to an existing library album when album-artist + title (the current album-id key) **and** track count match; map 1:1 by track number; listens attach to those `tracks.id` with `origin=cd`. Otherwise upsert hidden rows: `fingerprint_algo=cd-discid`, `fingerprint={discid}:{trackno}`, `is_missing=true`, `rel_path` NULL, Cover Art Archive image stored like a real album cover. Recount leaves those albums at `track_count=0` so Artists/Albums/Search stay empty of them. Radio already skips missing / no `present_audio`. Scan must never delete or “repair” `cd-discid` rows. FTS must not index them.
- **Audio path.** The disc **is** the file. Companion exposes a token-gated loopback HTTP WAV per track; byte offsets map to Red Book sectors (2352-byte CDDA frames). mpv `load`s that `http://127.0.0.1` URL (already allowed). Companion `load` takes an explicit **hog** flag: `true` → existing `set_device` / hard-fail if unarmed; `false` → no device required, mpv `audio-device=auto`. Do not sniff `/cdda/` in the sink. Exclusive on → hog at 16/44.1 (ignore `upsample_device`). Exclusive off → `hog: false`. Exclusive toggle mid-play reloads the current CD URL at the same position with the new flag. Never the Chrome element. Never analog MMC PLAY TRACK. Never a custom mpv with `cdda://`. Never upload PCM to the NAS.
- **Continuity.** Per-track live stream (cursor row = one virtual WAV). Next/prev/shuffle = new URL. Inter-track pause is a short reopen, not a guaranteed disc-accurate gap. No hidden track 1 / pregaps.
- **Correction.** libcdio-paranoia overlap+verify, `NEVERSKIP` off, drive ~8×, ~6 s RAM ring ahead of the playhead. Status **Reading** = spin-up or ring underrun; then **Playing**. Do not skip the track. A destroyed sector may still tick. Optional companion deps: `libcdio` + `libcdio-paranoia`. Companion still starts without them; the CD surface tells the operator to install.
- **Transport.** Full album: play/pause, prev/next, seek, repeat, shuffle. Shuffle/repeat start off on enter. Disable download, add-to-saved-playlist, add-to-queue, play-next, play-last, and lyrics for CD rows / while CD mode is on. Media Session installs CD handlers (not queue `playIndex`).
- **One store.** Prefs, live drives/media, cursor, and room face live on `frontend/src/stores/cd.ts` with a `setCdLive` writer. Do not add `cdPlayback.ts`. `companionClient` does not import that store. Optical WS handling is a small `frontend/src/exclusive/opticalClient.ts`, not more lines on the 700-line socket file. CD load is `frontend/src/playback/cdLoad.ts`, not a branch in `player.ts`.
- **Status face.** While CD mode is on, the compact status line is a spinning CD icon plus **Reading** / **Detecting** / **Playing** / **No disc** / **Drive missing**. Exclusive hog still happens; exclusive copy stays in the details sheet only.
- **Media-gone / swap.** Immediate stop, stay on the CD face, clear the CD cursor, **No disc** (then Detecting if a new disc appears). Do not mutate the on-demand queue.
- **Listens.** Only MB-identified plays (bound or hidden rows). `origin=cd`, `play_source=cd`, `profile=cdda`. Rankings stay unfiltered (no Stats chip split). 65% rule unchanged.
- **Controller.** Optical watch, TOC, eject, and CD `load` are controller-only (same lock as hog). A readonly tab does not drive the tray.

## Design

```text
[ Red Book disc ]
        │  libcdio + paranoia (8×, 6s RAM ring)
        ▼
[ companion optical port ]
   list / watch / TOC / CD-Text / eject
   GET /cdda/{device}/{track}?token=   ← virtual WAV, Range → LBA
   load hog:true|false
        │
        │  ws://127.0.0.1  +  mpv load http://127.0.0.1/cdda/…
        ▼
[ Mac PWA CD mode ]  CD cursor · pane is a view · CD room
        │
        │  POST /api/cd/identify  { toc, cd_text }
        ▼
[ library server ]
   disc id → MusicBrainz + CAA
   remember disc_id → release
   bind or hidden cd-discid rows + cover
```

**Companion** stays loopback-only and must not open `library.db`. Optical is a third job beside hog and the Downloads blob store.

**Server** owns identification, cover persistence, TOC memory, and listen identity. The PWA never talks to musicbrainz.org (UA / rate-limit stay on the existing outbound client).

**Client** owns chrome, the CD cursor, picker, and the status vocabulary. CD delivery is a loopback URL into the existing companion sink (`hog` option) — not a second mpv and not the HTML element. The playlist store is not a CD API.

TOC offsets, the MusicBrainz disc-id formula, and the virtual-WAV byte map are specified in [disc-identity.md](disc-identity.md) and [virtual-wav.md](virtual-wav.md).

## Stage map

1. **Companion optical port** — list drives, watch, TOC, CD-Text, eject, Mac libcdio + non-Mac stub.
2. **Live virtual WAV + hog-or-auto load** — depends on 01. Disc-as-file HTTP WAV and companion `load` with an explicit `hog` flag (no device required when false).
3. **Server disc identity** — independent of 02. Lookup-only identify, confirm/GET applied DTO with `tracks[].id`, bind-or-hide, scan/FTS guards.
4. **Settings + one CD store** — depends on 01. Prefs + live drives/media on `stores/cd.ts`; socket when CD is enabled.
5. **Session + chrome** — depends on 04. CD cursor, pane as view, `/cd`, fourth tab, status slot, Media Session hook. No stash. No audio.
6. **Identify UI** — depends on 01 + 03 + 05. Watch, Detecting, picker, Change disc, sentinels vs applied DTO.
7. **CD playback** — depends on 02 + 05 + 06. `cdLoad.ts`, transport on the cursor, Reading/Playing, eject button, exclusive reload.
8. **CD listens** — depends on 03 + 07. `origin=cd` / `play_source=cd` only for real library `track_id`s (never `cd:unknown:`).
9. **Living docs** — after the code exists. `design.md` is not living documentation.

## Out of scope

- Ripping / Import to library
- CD-ROM / data-session file playback (FLAC, MP3, AAC, folders)
- Windows/Linux optical implementation (stub only)
- Household restream / “CD radio”
- Analog MMC play-out of the drive
- Custom mpv built with `-Dcdda`
- Temp-file extract-then-play
- Hidden track 1, pregaps, gapless whole-disc concat
- Manual title editor or MusicBrainz text search
- Logging CD-Text-only or unidentified discs
- Visible Stats origin split
- Lyrics, Downloads, or saved-playlist add for CD rows
- iOS / Safari / Firefox
- Changing exclusive’s “no HTML fallback” rule for library/radio

## Assumptions

- Operator already runs `musicweb companion` with stock Homebrew mpv (no cdda protocol). Adding `brew install libcdio libcdio-paranoia` is acceptable and already present on the development Mac.
- The NAS can reach musicbrainz.org / coverartarchive.org when `MUSICBRAINZ_CONTACT_EMAIL` is set (same as artist portraits). When it cannot, the room still plays and shows CD-Text or Track N.
- Album browse (`track_count > 0`) plus radio’s `present_audio` check hide `cd-discid` rows once those tracks stay `is_missing`. Confirm/GET must return tracks; `list_for_album` will not.
- Hidden inserts must set NOT NULL `size_bytes`, `mtime_ns`, `added_at`, `indexed_at` (same as `_new_track`).
- `PlaySourceState` today is `none | streaming | downloaded | unavailable`; stage 07 adds `cd`.
- One companion controller is enough; a second tab is readonly and must not start a second laser.
- Red Book is stereo 16-bit / 44.1 kHz. Virtual WAV is that PCM with a 44-byte header.
- `require_http_url` already allows the loopback WAV URL; no protocol exception for `cdda://`. Today’s `_cmd_load` requires `_device_id` — stage 02 changes that via a `hog` flag, not a URL sniff.
- Domain-modeling / ADR beyond `docs/systems/cd-playback.md` is not required; that page is the durable home.
- libcdio eject is enough for USB SuperDrive / slot-load; failure is a toast, not a second product.
