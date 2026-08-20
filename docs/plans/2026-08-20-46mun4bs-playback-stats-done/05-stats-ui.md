# Stage 05: Stats UI

## Status
done

## Description

Add a bookmarkable Stats browse mode: time-range chips, stacked top-100 artist and track lists with dedicated rows, wired to `GET /api/listens/rankings`.

## Rationale

Collection without a place to read it fails the user-facing half of the goal. Settings is the wrong surface; browse modes are bookmarkable. Shared library rows have no play-count slot and always show ⋯ or +; reuse would special-case those components.

## Invariants

- Route `/stats`, name `stats`, `meta: { mode: "stats", pane: "library", title: "Stats" }`.
- ModeBar always includes **Stats** (not gated on downloads). Place it after Search, before Downloads-when-enabled.
- Query `range` is `all` | `7d` | `30d` | `YYYY-MM` where month is `^\d{4}-(0[1-9]|1[0-2])$`. Missing or invalid → treat as `all` and `replace` so `/stats` is the canonical all-time URL (omit `?range=` when all-time; set the query when not). `StatsView` **watches** `route.query.range` and fetches from that watch. Chip click only `replace`s the query (does not fetch on its own). Browser-back / forward between ranges must refetch because the route is the source of truth.
- Chip row: `All-time`, `Last 7 days`, `Last 30 days`, then `months[]` from the payload, newest first. Label current-year `YYYY-MM` as the English month word (`August`); older years as `2025 — December` (en dash). Do not invent empty months.
- Current year for labels: if payload `timezone` is a `ZoneInfo` key, use that zone’s calendar year; if `"local"` or unusable, use the browser’s local year. Keys stay `YYYY-MM` from the server.
- Dedicated stats rows (new components): cover via `artistImageUrl` / `coverUrl`, label, play count. `StatsTrackRow` includes `LossyMark` as a **sibling** button like `TrackRow` (play hit target excludes `.lossy-mark`; do not nest the mark in the play control). Artist tap → `{ name: "artist", params: { artistId } }`. Track tap → `playOrQueueTrack(track)`. No ⋯, no +, no chevron, no `DownloadIcon`. Do not add `playCount?` / `hidePlus?` / `showMenu` forks to `ArtistRow` / `TrackRow`.
- `ListenTrack = Track & { playCount: number; lastCountedAt: string }` via `fromApiTrack` plus the two extras. `ListenArtist` is an **intersection type only**: `ArtistListItem & { play_count: number; last_counted_at: string }`. Do not add fields to the `ArtistListItem` type. Do not put `playCount` on `Track`. Do not write `fromApiArtist`. Do not hand-roll a second Track mapper.
- When `mode === "stats"`, `LibraryView` must not call `loadLibraryPage` or the rest of `load()` — a five-line early return (`watchNavigation` keys on `route.fullPath`; chip changes would otherwise show “Unknown view”). The stats branch **sets the chrome title to `Stats`** (`title` defaults to `"Folders"` and only changes inside `load()`). `showAddAll` / selection stay off (do not add `stats` to those allow-lists). `#view-library` root stays on `LibraryChrome`.
- Treat `stats` like `search` in `isTreeActive`. Do **not** add `stats` to `isTreeCapable` / `libraryShowTree` / `libraryShowLayoutToggle`. Do **not** edit `treeNavigation.ts`.
- Online-only: no localStorage/IDB ranking cache. Rankings 200 calls `noteServerReachable()`. Fetch failure calls `noteServerUnreachable` and uses `connectivityLoadError` / `connectivityBanner` the same way `LibraryView.load()` does.
- Empty copy: both lists empty **and** `months` empty → **No listening history yet**. Selected range empty but `months.length > 0` → **No listens in this range**.
- Do not hide the library Settings gear. “No settings control” means no collection toggle.
- Chip helpers (parse, label, chip list) are pure and unit-tested. The Vue page is not required to have a Vitest browser test.
- `LibraryView` stays a single `#view-library` root.

## Risks

- A leftover tree layout plus a stats-unaware `isTreeActive` would treat the pane as tree. Naming `stats` next to `search` in that check is required even though `isTreeCapable` already excludes it.

## Implementation

### Files

- Create: `frontend/src/listens/rangeChips.ts` (parse query, month label, chip model)
- Create: `frontend/src/listens/types.ts` (`ListenArtist`, `ListenTrack`, rankings payload)
- Create: `frontend/tests/listens/rangeChips.test.ts`
- Create: `frontend/src/components/stats/StatsView.vue`
- Create: `frontend/src/components/stats/StatsArtistRow.vue`
- Create: `frontend/src/components/stats/StatsTrackRow.vue`
- Change: `frontend/src/router.ts`
- Change: `frontend/src/components/layout/ModeBar.vue`
- Change: `frontend/src/components/library/LibraryView.vue` (mount StatsView; skip `load()` for stats; `isTreeActive` includes `mode !== "stats"`)
- Change: `frontend/src/api.ts` (`fetchListenRankings` — wrap `fromApiTrack`; compose `ListenArtist`, do not widen `ArtistListItem`)
- Change: `frontend/css/library.css` (chip row + count column; reuse `.mode-bar` horizontal-scroll rules where they fit)
- Do not change: `frontend/src/components/tree/treeNavigation.ts`

### Steps

1. `rangeChips.ts`: `parseStatsRange(raw) -> "all" | "7d" | "30d" | "YYYY-MM"`, `monthChipLabel(key, currentYear)`, `buildRangeChips({ months, currentYear })`. Tests: invalid → `all`; `99-1` / `2026-13` → `all`; current-year vs prior-year labels; chip order.
2. Add the route. ModeBar entry `{ id: "stats", label: "Stats", name: "stats" }`.
3. `fetchListenRankings(range)` → `GET /api/listens/rankings?range=`. `mapListenTrack` = `{ ...fromApiTrack(raw), playCount, lastCountedAt }`. Artists stay `ArtistListItem` plus `play_count` / `last_counted_at`.
4. `StatsView`: watch `route.query.range` and fetch on that watch; render chips (chip click only `replace`s the query); two lists of dedicated rows. On 200: `noteServerReachable()`. On throw: `noteServerUnreachable()`. Empty copy as in Invariants.
5. `LibraryView`: if `mode === "stats"`, skip `load()`; set `title` to `Stats`; render chrome + `StatsView`.
6. Typecheck. Node tests for `rangeChips`.

### Verify

```sh
pnpm --dir frontend typecheck
pnpm --dir frontend test
```

Browser (required before calling the stage done): desktop and mobile viewports — open Stats, switch All-time / 7d / a month chip, confirm the URL, use browser back between two ranges and confirm the lists match the URL, tap an artist (lands on artist page), tap a track (queues/plays), open Queue and confirm ModeBar still highlights Stats via `lastLibrary`, confirm layout toggles are absent, confirm the Settings gear is still present, confirm offline/server-down uses the connectivity empty/error path (not a stale list).

## Acceptance

- [ ] `/stats` and `/stats?range=2026-08` are bookmarkable and survive refresh (SPA fallback already serves the shell). Browser-back between chips refetches from the watched `route.query.range`.
- [ ] Chips match the naming rules; empty months are absent; invalid range becomes `/stats`.
- [ ] Two stacked top-100 lists of dedicated rows; artist navigates; track plays via `playOrQueueTrack`; `StatsTrackRow` shows `LossyMark`.
- [ ] `ArtistRow` / `TrackRow` / `Track` / `ArtistListItem` are unchanged. Rankings wrap `fromApiTrack` and compose `ListenArtist`.
- [ ] Chrome title is `Stats` without going through `load()`.
- [ ] Empty states: “No listening history yet” vs “No listens in this range”.
- [ ] `load()` does not run on stats (no “Unknown view” on chip change).
- [ ] No layout toggle, no ⋯, no collection toggle. Settings gear remains.
- [ ] Fetch 200 goes through `noteServerReachable`; throw goes through `noteServerUnreachable`; there is no ranking cache.
- [ ] `treeNavigation.ts` is unchanged.
