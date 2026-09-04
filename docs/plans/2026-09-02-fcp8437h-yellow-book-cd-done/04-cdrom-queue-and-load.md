# Stage 04: CD-local queue and as-is load

## Status
done

## Description

On `kind === "data"`, stop identify, start the data session (`startCdromSession`), apply auto-add, and play queue rows through `cdLoad` using `/cdrom/file` URLs. Replace the **Not an audio CD** face with `data` / `no_playable`. Skip to next on a failed load. Desktop still mounts `CdTrackList` as a dumb `cd.tracks` list.

## Rationale

The verbs and the cursor have to exist before the split chrome. Red Book already owns `cd.tracks` + `cdLoad`; Yellow Book reuses that cursor with a different URL.

## Invariants

- Occupant stays `cd`. `stores/playlist.ts` is not imported from the new CD-ROM modules.
- `kind === "audio"` still runs `runIdentify` and WAV `cdTrackUrl`. `kind === "data"` never calls identify or `/cdda/`.
- Synthetic id is `cdrom:` + relative POSIX path. No `albumId` / `artistId`. Key delivery, cover, and later lyrics off `track.id` (`cdrom:` prefix), not a `mediaKind === "data"` ladder in every chrome file.
- Auto-add and sort follow [context/disc-files.md](context/disc-files.md) and [context/design.md](context/design.md).
- `cdromPlayOrQueue` copies `playOrQueueTrack` semantics against `cd` only (append; start only when the CD queue is empty or paused). Do not import `playOrQueueTrack`. Play all **replaces** `cd.tracks` and plays index 0.
- `startCdromSession()` owns list + auto-add. Call it from `applyOpticalLive` when session is `cd` and kind becomes `data`, and from `enterCdMode` when already `mediaKind === "data"` (Leave → Enter, and first enter after insert-while-not-in-cd).
- Leave / eject / media-gone / kind change to audio clears the CD-ROM tree and queue. Re-enter of an already-cd data session does not reset shuffle/repeat or wipe a live queue.
- Same-kind new disc (`volume_id` change, via a new `optical_media` + `cdrom_index`) rebuilds the tree and re-runs auto-add (queue is replaced by that rule, including the empty prompt state).
- Faces: add `data` and `no_playable` to `CdRoomFace`. Stop assigning `not_audio` for `kind === "data"`. Copy: **Data CD** / volume name / **No playable audio**.
- Desktop still mounts `CdTrackList` for data as a dumb `cd.tracks` list. Do not claim it is the filesystem room. Hide Change disc.
- Read/load error: toast + `cdNext` if the new `cdLoad` generation is still current; stop only when nothing remains.
- Play source is `setPlaySourceState("cd", "cdrom", …)` for every data file. Never `"cdda"`.
- `isLossy` / `sourceCodec` from walk-time kind ([disc-files.md](context/disc-files.md)). `cdLoad` never calls `exclusiveDelivery`. Hog flag still wraps the as-is URL.

## Risks

- Leaving `applyOpticalLive` on the `not_audio` short-circuit will hide the new face and still call `notifyCdMediaGone` on every data disc.
- Mixing `cdrom:` rows into identify confirm would write junk stubs — data kind must not enter `identifyFlow`.

## Implementation

### Files

- `frontend/src/stores/cd.ts`
- `frontend/src/cd/cdrom.ts`
- `frontend/src/cd/cdromQueue.ts`
- `frontend/src/exclusive/opticalClient.ts`
- `frontend/src/playback/cdLoad.ts`
- `frontend/src/playback/cdDelivery.ts`
- `frontend/src/playbackStatus.ts`
- `frontend/src/lossyKind.ts`
- `frontend/src/components/lossy/LossyMark.vue`
- `frontend/index.html`
- `frontend/public/static/img/va-artist-thumb.webp`
- `frontend/src/components/cd/CdNowPlaying.vue`
- `frontend/src/components/cd/CdMini.vue`
- `frontend/tests/stores/cd.test.ts`
- `frontend/tests/cd/cdromQueue.test.ts`
- `frontend/tests/playback/cdLoad.test.ts`
- `frontend/tests/playback/cdDelivery.test.ts`
- `frontend/tests/playback/playbackStatus.test.ts`
- `frontend/tests/lossyKind.test.ts`

### Steps

1. In `frontend/src/exclusive/opticalClient.ts`, parse `volume_name` on `optical_media` and handle `cdrom_index` / `cdrom_list` (including unsolicited enrich pushes). Add `listCdrom(rel)` send helper. Keep unknown-field tolerance for older companions.
2. Add `frontend/src/cd/cdrom.ts`: in-memory tree, cwd, `formatCdromLabel`, `sortCdromFiles`, `isCdromTrack` (`id` starts with `cdrom:`), `trackFromCdromFile` (`id: "cdrom:"+rel`, `isLossy` / `sourceCodec` from walk-time kind, no `albumId` / `artistId`). Cover helper: `/cdrom/cover?device=&rel=&token=` when `has_cover`, else `/static/img/va-artist-thumb.webp`. `startCdromSession()` lists + auto-adds. On `cdrom_list`, patch live `cd.tracks` in place by `rel` (title/artist/album/cover/duration). Cursor and order stay.
3. Add `frontend/src/cd/cdromQueue.ts`: `cdromPlayOrQueue`, `cdromAdd`, `cdromAddFolder` (recursive), `cdromPlayAll` (replace + `cdLoad(0)`), remove / clear / reorder. These mutate `cd.tracks` / `cd.index` only.
4. `frontend/src/stores/cd.ts`: add faces `data` and `no_playable`. `applyOpticalLive` on kind→data (session is `cd`) calls `startCdromSession()`; does **not** run identify or assign `not_audio`. `enterCdMode` calls `startCdromSession()` when already `mediaKind === "data"` (Leave → Enter). `leaveCdMode` / media-gone / kind→audio clears the `cdrom.ts` tree (lyrics prefix drop is stage 06). Audio kind still `runIdentify`.
5. `frontend/src/playback/cdDelivery.ts`: `cdromFileUrl(port, token, deviceId, rel)` with query `device`, `rel`, `token`.
6. `frontend/src/playback/cdLoad.ts`: if `isCdromTrack(track)`, load `cdromFileUrl` for `cd.tracks[index].path`. Add a module-level load generation (increment at the start of `cdLoad`; ignore stale `onError` / skip). Hog flag unchanged. On load/sink failure while the gen is current, toast and `cdNext`. `setPlaySourceState("cd", "cdrom", null)` — never `"cdda"` for a data file. Exclusive toggle still reloads the same URL after duration is known. Do not call `exclusiveDelivery`. `writeCdMediaSession` uses the CD-ROM cover helper, not `audio-cd.svg`.
7. Face strings in `frontend/src/playbackStatus.ts`, `CdNowPlaying.vue`, `CdMini.vue`: **Data CD** / volume name / **No playable audio**. Hide Change disc when the current row is `cdrom:` / face is `data` or `no_playable`. `NowPlayingView` already shows `LossyMark` via `kindForTrack` — do not add `hideLossyMark`.
8. Extend `LossyKind` with `"wma"` in `lossyKind.ts` (`kindForTrack`, `kindForAlbum`, `lossySourceParts`). Map it in `LossyMark.vue`. Add `<symbol id="i-fmt-wma">` in `frontend/index.html` (text `WMA`, same 24×24 / 8pt / `currentColor` as `i-fmt-mp3`). Copy `src/musicweb/images/assets/va-artist-thumb.webp` to `frontend/public/static/img/va-artist-thumb.webp`. Do not extend `sourceFileMedia`.
9. Tests: data kind no longer expects `not_audio` + identify; Leave → Enter with data already set calls `startCdromSession` (`frontend/tests/stores/cd.test.ts`). Queue verbs + auto-add + sort + in-place `rel` patch in `frontend/tests/cd/cdromQueue.test.ts`. `cdromFileUrl` query shape. `cdLoad` data branch does not call `cdTrackUrl`, uses profile `cdrom`, and ignores a stale gen. `kindForTrack` returns `wma` for `{ isLossy: true, sourceCodec: "wma" }`. playbackStatus copy.

### Verify

- `pnpm --dir frontend test -- frontend/tests/stores/cd.test.ts frontend/tests/cd/cdromQueue.test.ts frontend/tests/playback/cdLoad.test.ts frontend/tests/playback/cdDelivery.test.ts frontend/tests/playback/playbackStatus.test.ts frontend/tests/lossyKind.test.ts`
- `rg -n "not_audio" frontend/src/stores/cd.ts frontend/src/playbackStatus.ts` has no data-kind assignment to `not_audio`.
- `rg -n "from \\\"@/stores/playlist\\\"|from '@/stores/playlist'" frontend/src/cd` is empty.
- `rg -n "i-fmt-wma" frontend/index.html` hits the new symbol.
- `rg -n "setPlaySourceState\\(\"cd\", \"cdda\"" frontend/src/playback/cdLoad.ts` is not used on the data / `cdrom:` branch.

## Acceptance

- Inserting a one-folder fixture index auto-fills `cd.tracks` and does not open the identify picker.
- Leave → Enter with `mediaKind === "data"` already set starts the session again (list + auto-add) without identify.
- Two audio folders leave `cd.tracks` empty. Face is `no_playable` after a finished empty walk; mount-pending is `data` / **Data CD**.
- `cdromPlayOrQueue` matches library start-if-empty-or-paused.
- `cdromPlayAll` replaces the CD queue.
- A pushed `cdrom_list` patches queue titles/covers by `rel` without moving `cd.index`.
- Data `cdLoad` uses `/cdrom/file`, never `/cdda/`, and reports profile `cdrom`.
- A failed data load toasts and advances; a stale gen does not skip again.
- WMA walk-kind shows `fmt-wma`; ALAC/FLAC show no mark. Now-playing cover is `/cdrom/cover` or the VA thumb, not `audio-cd.svg`.
- Red Book identify + WAV load tests still pass. Desktop data disc still shows `CdTrackList` of `cd.tracks` (dumb list).
