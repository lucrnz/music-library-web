# Stage 05: CD track list chrome

## Status
done

## Description

Give CD its own list. Revert `PlaylistView` to the on-demand queue. Show that list on mobile `/cd` and as the desktop right pane while CD is on.

## Rationale

`PlaylistView` grew ~15 `isCd` branches and a context-menu bug (right-click reads `pl.tracks`). Mobile `/cd` has no list. Radio already owns its list; CD should too.

## Invariants

- `musicweb.playlist.v1` is never read or written by the CD list.
- Disc list: no remove, drag-reorder, edit, download, save, add-to-queue, play-next, play-last.
- Click a row → `cdLoad(index)`, not `playIndex`.
- Leave still restores the queue pane to whatever it already was.
- One helper (`queueActionsAllowed` or equivalent) gates library/queue mutation menus. Menu builders do not each invent `activeSession() === "cd"`.
- `PlaylistView` does not import `stores/cd` or `cdLoad`.

## Risks

- Desktop pane swap must keep the playlist header’s CD button somewhere visible (header of the CD list, or a thin chrome strip). Do not lose the only desktop entry control.
- Dynamic `import("@/playback/cdLoad")` in `PlaylistView` goes away; `CdTrackList` may import `cdLoad` directly.

## Implementation

### Files

- `frontend/src/components/cd/CdTrackList.vue`
- `frontend/src/components/cd/CdView.vue`
- `frontend/src/components/playlist/PlaylistView.vue`
- `frontend/src/components/playlist/queueMenuItems.ts`
- `frontend/src/components/library/trackMenuItems.ts`
- `frontend/src/components/library/albumMenuItems.ts`
- `frontend/src/components/App.vue`
- `frontend/src/playback/session.ts`
- `frontend/css/cd.css`
- `frontend/tests/playlist/queueMenuItems.test.ts`
- `frontend/tests/library/trackMenuItems.test.ts`

### Steps

1. Add `queueActionsAllowed()` on `frontend/src/playback/session.ts` (`activeSession() === "queue"` or `none`). Point `queueMenuItems` / `trackMenuItems` / `albumMenuItems` at it. Fix the `session.ts` file comment (it still says queue vs radio vs none).
2. Add `CdTrackList.vue`: title CD, empty copy (No disc / Insert a disc), rows from `cd.tracks` / `cd.index`, row click loads that index. No edit/drag/delete/menus.
3. `CdView.vue` mounts the list under `CdNowPlaying`.
4. `App.vue`: while desktop and `activeSession() === "cd"`, render `CdTrackList` instead of `PlaylistView` in the right pane. Keep the CD header button on that list (or a one-line bar) so desktop can leave/re-enter. Mobile `/cd` already mounts `CdView`.
5. Revert `PlaylistView.vue` `isCd` branches and CD imports. The header CD button stays only if this pane is still the desktop host — if the pane is swapped away, the button lives on `CdTrackList` instead.
6. Tests: menu builders return no queue mutations when session is `cd`; playlist tests no longer describe a CD mode.

### Verify

```sh
pnpm --dir frontend test -- frontend/tests/playlist/queueMenuItems.test.ts frontend/tests/library/trackMenuItems.test.ts
pnpm --dir frontend typecheck
```

## Acceptance

- Desktop CD mode shows the disc tracks in the right pane and does not render queue rows there.
- Mobile `/cd` shows the disc track list.
- Right-click / overflow on a CD row cannot open or mutate a queue item.
- After leave, the queue pane is the pre-CD queue with `playlist.v1` unchanged.
- `PlaylistView.vue` has no `isCd` / `stores/cd` / `cdLoad` references.
