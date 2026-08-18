**Archive.** Decisions in this file were current as of 2026-08-18 (the plan date in the directory name). They may be outdated. Do not treat this as living documentation. This plan directory is an archive.

# Resume playback position

## Goal

When playback pauses (any trigger) or the page hides, store the current track’s position in `localStorage`. On the existing now-playing restore, show that time and seek to it when the user presses Play. Do not auto-play.

## Settled decisions

- **Write on pause and page hide.** Persist from any pause (`onPauseState` / in-app button, Android Now Playing, browser and lock-screen media banners, exclusive companion) and from `pagehide` plus `visibilitychange` when the document is hidden. No throttled writes while playing.
- **Also write seeks while paused.** `seekToFraction` and Media Session `seekto` persist when already paused, including a scrub of the restored bar before Play.
- **Dedicated key.** `musicweb.playbackPosition.v1` holds `{ trackId, seconds }`. One slot for the current track. Not folded into `musicweb.playlist.v1`. Not a per-track history.
- **Hydrate UI; seek on first Play.** After queue restore, set `player.currentTime` (and `player.duration` from the track tag when present). Do not load media on boot. Seek only when Play starts and `playSource` is still `none`.
- **Cold load only.** If media is already loaded, tapping the current queue row still restarts from 0 (today) and clears the slot so it cannot snap back to the old pause.
- **Match current track id.** Apply only when the restored `pl.current.id` equals the saved `trackId`. Clear on skip, stop, queue clear, track end, and a from-zero reload of an already-loaded track.
- **Near-end is 0.** If saved seconds are within 3s of duration (same threshold as prev-track restart) or `>=` duration, resume at 0.
- **Exclusive / companion is in.** Same persist and restore. Companion seek waits until duration is known.

## Design

Today `loadPlaylist()` restores the queue and current index, `applyExpanded()` restores the sheet, and `refreshPlayerCovers()` restores art. Audio is not loaded. `playSource` stays `none`. Play calls `playIndex`, and both sinks `load` from the start. Pause already funnels through sink `onPauseState` (Media Session `pause` calls `activeSink.pause()`, which emits the same event). That is the single persist hook for every pause surface.

A new pure module owns the key, schema, clamp, and id match. `player.ts` must not grow untested persist policy. Tests import that module only — they do not import `player.ts` (see `docs/development/testing.md`).

**Write.** After `syncTransportFlags` on pause, if `playSource` is `streaming` or `downloaded` and `pl.current.id` exists, write `{ trackId, seconds: player.currentTime }`. Requiring a live play source avoids saving when `stopPlayback` / `beginLoad` call `stop()` (those already set `playSource` to `none` before the sink pause fires). Page hide writes the same shape whenever there is a current track id and a finite `player.currentTime >= 0`, including a hydrated-but-never-played restore (so a pre-play scrub survives).

**Read / apply.** `resumeSeconds({ trackId, saved, duration })` returns `null` when there is no match, and `0` when the saved time is within 3s of a known duration or `>=` duration. Boot hydrate uses the track tag duration. The first cold `playIndex` captures `playSource === "none"` *before* `beginLoad()` clears it, then seeks after a successful load. Companion `seek` no-ops until duration is known: keep a per-`playGen` pending resume and flush on the first `onDuration` / `onTime` with `duration > 0`, re-clamping against sink duration.

**Seek with no media.** When `playSource === "none"`, `seekToFraction` uses `player.duration` (hydrated from the tag), updates `player.currentTime`, and writes the slot. It does not call the sink.

**Clear.** `stopPlayback`, `pl.clear` / empty queue, advancing to another track, `onSinkEnded` that leaves this track (not repeat-one), and `playIndex` when `playSource` was not `none`. A cold `playIndex` of a *different* id also clears.

## Stage map

The store is independent of player wiring and is the only piece the test harness is allowed to import. Persist/restore wiring is one stage because both sides share `playIndex` / `seekToFraction` / `onPauseState` and are not useful apart. Living docs last so `docs/systems/playback.md` describes the shipped contract.

1. **Position store** — key, schema, read/write/clear, `resumeSeconds`. Unit tests.
2. **Persist and restore** — boot hydrate, pause/pagehide/seek writes, cold-load seek, invalidation. HTML and companion.
3. **Living docs** — resume contract on the playback page.

## Out of scope

- Auto-play on restore or any other boot path
- Throttled or `timeupdate` writes while playing
- Per-track resume history
- Loading media paused on boot
- Changing Media Session / OS banner behavior beyond the position we already publish after a real load
- IndexedDB or embedding position in `musicweb.playlist.v1`

## Assumptions

- Track tag `duration` is seconds and is present often enough to draw the restored bar. When it is missing, the bar stays empty until Play (same as today); seek still applies after sink duration is known.
- Closing a tab or backgrounding the PWA while playing fires `pagehide` or `visibilitychange` often enough that pause-only is not required for those cases.
- `playPrev`’s 3-second restart threshold is the right near-end constant to reuse.
