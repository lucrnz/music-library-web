# Stage 06: Radio tab

## Status
done

## Description

Add the `/radio` destination, a third mobile tab, desktop Radio-replaces-dual-pane chrome, and a preview face bound to the now-playing snapshot/WS. Tune-in audio is stage 07; this stage renders a Tune in control that is **disabled** (visible, not wired). Not a live-looking no-op.

## Rationale

The station is already visible over HTTP. Shipping the room first keeps layout (including title / subtitle matching on-demand) off the player-integration critical path.

## Invariants

- Radio is a **pane**, not a ModeBar browse chip. Do not add it to `BASE_MODES`.
- Radio pane CSS is `frontend/css/radio.css`, not an extension of `player.css`.
- Opening `/radio` does **not** steal the mini-player (settled).
- Title line and subtitle match on-demand: title alone; subtitle `[artist, album].filter(Boolean).join(" — ")`. No `title - artist [album]`.
- `radio.ts` owns the socket. `RadioView` calls `connect()` on enter. It does **not** `disconnect()` on leave (stage 07 needs the socket for chrome `stopped` | `tuning` | `tuned`). Disconnect policy is written in stage 07.
- `/radio` is bookmarkable; SPA fallback already serves unknown paths.

## Risks

- A still-mounted `LibraryView` on `/radio` sees `mode || "folders"` (`effectiveLibraryMode` only holds last library when `pane === "queue"`). CSS hide is not enough.
- A third tab needs a sprite glyph in `frontend/index.html`. Reuse an existing icon only if it reads as radio; otherwise add one.

## Implementation

### Files

- `frontend/src/router.ts`
- `frontend/src/components/App.vue`
- `frontend/src/components/layout/TabBar.vue`
- `frontend/src/components/radio/RadioView.vue`
- `frontend/src/stores/radio.ts`
- `frontend/src/api.ts`
- `frontend/css/app.css`
- `frontend/css/desktop.css`
- `frontend/css/radio.css`
- `frontend/index.html` (sprite)
- `frontend/tests/stores/radio.test.ts`
- `frontend/tests/library/browseMode.test.ts` (must still **not** treat radio as a library mode)

### Steps

1. Route `{ path: "/radio", name: "radio", meta: { pane: "radio", title: "Radio" } }`.
2. `TabBar`: Library | Playlist | Radio. Active state from `route.meta.pane`.
3. `App.vue`: when `pane === "radio"`, **`v-if` unmount** library+downloads and playlist; mount `RadioView` only. Do not CSS-only hide. Do not add `radio` to `effectiveLibraryMode` / `useLibraryLocation`. Desktop: show `#tab-bar`; Library and Playlist tabs remount the dual-pane. `rememberLibraryRoute` already ignores non-library panes.
4. `radio.ts` is chrome + façade and owns the socket: `connect()` / `disconnect()`. Hydrate: `fromApiTrack` **only** when face is `current` and `id` is present. `skip_pending` / `catching_up` / `idle` have no track. Keep official `position` (seconds) interpolating between snapshots. Distinct flags for those faces. No upcoming fields. Covers use existing `coverUrl` helpers.
5. `RadioView` mounts `RadioNowPlaying` with `layout="room"` (main-area; no `#player .player-full` compact grid). Distinct `catching_up` / `skip_pending` spinner vs idle empty. Tune in control **disabled** (visible, no click handler). Codec / lossy rows may wait for stage 07.
6. `RadioView` calls `connect()` on enter. **Do not** `disconnect()` on unmount.
7. Node tests for interpolation, `catching_up` vs `skip_pending` vs idle vs current; `fromApiTrack` is not called without an id; mock `@/api`. Do not import `player.ts`. Do not send `tune_in` yet.

### Verify

- `pnpm --dir frontend test -- frontend/tests/stores/radio.test.ts`
- `pnpm --dir frontend typecheck`
- Browser: mobile width — third tab, `/radio` preview advances without Tune-in (`catching_up` vs idle vs current are distinct); library mini-player unchanged if a queue track was showing. Desktop — Radio replaces both panes; Library tab restores dual-pane. Title/subtitle match the on-demand player typography and `Artist — album` subtitle.

## Acceptance

- `/radio` is a third tab destination, not a browse chip.
- Preview shows `catching_up`, `skip_pending`, current, or idle from GET+WS and never next tracks. `catching_up` / `skip_pending` are not the idle empty state.
- Metadata layout matches on-demand (title, then `Artist — album`).
- Opening Radio does not change the existing queue bar. Tune in is visible and disabled. Library+playlist are unmounted (`v-if`), not CSS-hidden. RadioView unmount does not disconnect the WS.
- Desktop Radio is full-main-area; leaving it restores library+queue.
