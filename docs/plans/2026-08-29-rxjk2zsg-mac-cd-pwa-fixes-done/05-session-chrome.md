# Stage 05: CD session toggle, mini, and narrow handoff

## Status
done

## Description

Make the desktop CD icon a session toggle. Keep collapse as hide-rail-only. Add `CdMini`, compact `CdNowPlaying` when the rail is down, and a radio-style `/cd` handoff under 900px. Re-entering an already-cd session must not reset shuffle/repeat or re-identify. Leave exists on the room and the mini.

## Rationale

Today the CD button only collapses the rail, the mini bar drives the **queue**, and a narrow Mac PWA window drops all CD chrome while mpv keeps playing. That is how a session toggle was promised and a queue Play steals the disc.

## Invariants

- `become("cd")` still does not stash or rewrite `playlist.v1`.
- Leave = desktop CD icon while session is cd, Leave on room/mini, library Play-all, Radio Tune-in. Not collapse. Not switching away from `/cd`.
- `queueActionsAllowed()` stays false while session is cd (stage 06 closes the remaining add holes).
- `enterCdMode` while already `cd` only opens the rail / ensures watch — it does not clear the cursor flags or call `runIdentify`.

## Risks

- `App.vue` rail watch currently calls `enterCdMode` whenever the CD rail is open. That path must become the already-cd no-op after the first enter.
- Mobile tab to `/cd` still enters; it must not leave on the way out.

## Implementation

### Files

- `frontend/src/stores/cd.ts`
- `frontend/src/components/App.vue`
- `frontend/src/components/player/PlayerBar.vue`
- `frontend/src/components/playlist/PlaylistView.vue`
- `frontend/src/components/cd/CdTrackList.vue`
- `frontend/src/components/cd/CdNowPlaying.vue`
- `frontend/src/components/cd/CdMini.vue`
- `frontend/src/components/cd/CdView.vue`
- `frontend/tests/stores/cd.test.ts`
- `frontend/tests/playback/handoff.test.ts`

### Steps

1. Add `toggleCdSession()`: if `activeSession()==="cd"` then `become("none")` (leave hook already stops transport + watch); else `enterCdMode()`. Desktop playlist/CD-list header icons call this. Collapse stays `toggleCdRail` / Close on `NowPlayingView`.
2. Split `enterCdMode`: first enter resets shuffle/repeat off, opens rail, starts watch, identify-if-toc. Already-cd only `openCdRail()` + `notifyCdEnter` (Media Session) + watch if needed.
3. `CdMini.vue`: same job as `RadioMini` — cover, title, play/pause (`cdToggle`), next, Leave. Mount from `PlayerBar` when session is cd and the desktop CD rail is not open and the route is not mobile `/cd`.
4. `PlayerBar`: `visible` is true when session is cd. Do not mount queue mini / `togglePlay` / `playNext` in that case. Desktop collapsed CD uses `CdNowPlaying layout="bar"` or the mini — pick one surface, not both. Hide the queue `NowPlayingFull` while session is cd.
5. `App.vue`: when desktop shrinks while session is cd and the route is not `/cd`, `router.push({ name: "cd" })` (mirror the radio handoff). `/cd` while desktop still absorbs to the rail. Leaving `/cd` does not `become`.
6. Leave control on `CdNowPlaying` and `CdMini` calls the same `toggleCdSession` / leave path.
7. Tests: second desktop toggle leaves and does not rewrite the playlist blob. Re-`enterCdMode` while cd keeps shuffle. Narrow handoff is a router replace/push test if one exists for radio; otherwise assert the watch condition in a small App extract if that is how radio is tested — do not invent an App mount if radio has none. Store test: already-cd enter does not call identify (spy).

### Verify

```sh
pnpm --dir frontend exec vitest run tests/stores/cd.test.ts tests/playback/handoff.test.ts
```

## Acceptance

- Desktop CD icon on → CD list + session cd. Icon again → queue pane, session none, watch off, audio stopped.
- Collapse / X keeps session cd and the disc list.
- Session cd + collapsed rail or Library tab shows CD transport, never queue Play/Next.
- Windowed PWA under ~900px with session cd lands on `/cd`. Tab away keeps audio.
- Re-opening the CD rail does not flip shuffle off or restart Detecting.
