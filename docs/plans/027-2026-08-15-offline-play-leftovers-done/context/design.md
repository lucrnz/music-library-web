> **Archive.** Decisions in this file were current as of 2026-08-15 (the plan date in the directory name). They may be outdated. Do not treat this as living documentation. This plan directory is an archive.

# Offline play leftovers

## Goal

Close leftover play bugs on the plan 026 path, name the play-online gate once, and when that gate is closed (downloads on) show undownloaded queue rows as unavailable and skip them on next/prev/ended. Same success story: installed PWA, Downloads tab, play OPFS files.

## Settled decisions

- **Scope:** same as 026 — launch, Downloads, play local. Folders may still error.
- **Codecs probe:** boot `GET /api/codecs` uses `cache: "no-store"` (same idea as `/api/health`). Other `apiGet` callers unchanged.
- **Play-online helper:** add `canUseRemoteMedia()` on `connectivity.js` as `canReachServer() && hasConfirmedReachability()`. `canReachServer()` stays optimistic. Play resolve, player remote covers, and local-blob stream fallback all call the helper — no third handwritten conjunct.
- **Queue offline (downloads enabled only):** when `!canUseRemoteMedia()`, rows without a **playable OPFS file** (`joinDownloadUiStatus` `ready` or `other`) are grayed out. Broken, missing, pending, and in-progress are gray. If downloads are **disabled**, no gray and no skip.
- **Skip:** `playNext` / `playPrev` / ended walk over gray rows (shuffle cursor advances). `repeat=all` wraps once through the remaining order; if nothing playable, stop. `repeat=one` on a gray current track does not loop — that step stops or skips out as if repeat were off. Tap a gray row still `playIndex` (existing `offline_no_local` / `broken`). Do not auto-skip the current track when reachability drops.
- **Skip lives in transport**, not `computeNextIndex`. Explicit `playIndex(i)` unchanged. Near-end prepare / `peekNextIndex` unchanged.
- **No extras:** queue/Downloads `<img>` `/api/cover`, queue Go-to online routes, lyrics, `downloads.ready` wait, download-queue pump, health-probe widening — out.
- **Exclusive still out:** no HTML/OPFS fallback; no exclusive-formats cache.
- **Landing still out:** no auto-route to Downloads, no last-pane restore.
- **Plan 018 / 026:** no stream-fail → local while **confirmed** reachable.
- **Living docs last.** This directory is not living documentation.

## Design

026 made play-source “online” mean confirmed this session. Three leftovers.

**False confirm.** The boot codecs GET can be served from the browser HTTP cache. A cached 200 while the origin is down calls `reportSuccess()`. The probe must be live: `cache: "no-store"` on that GET only. Health already does this for `/api/health`.

**Unnamed play-online gate.** Resolve and covers already write `canReachServer() && hasConfirmedReachability()`. Local-blob `attemptPlay` fail still keys only on `canReachServer()`, so optimistic `online` plus a bad OPFS file hits `/api/stream`. Do not paste the conjunct a third time. Name it `canUseRemoteMedia()` on the connectivity owner and switch all three play sites. Prepare and the download queue keep `canReachServer()`.

**Queue when that gate is closed.** If downloads are on and the session cannot use remote media, the queue is an offline list: playable local files stay normal; everything else looks unavailable. Next/prev/ended skip the gray rows so transport does not land on `offline_no_local` by accident. Tap still means “try this index.” Current playback is not yanked when reachability drops.

Do not add stream → OPFS when confirmation is already true.

## Stage map

1. **Codecs probe no-store** — `reportSuccess` from the boot GET means the origin answered. First because a lying confirm poisons play and skip.
2. **`canUseRemoteMedia` + local-fail** — names the gate; fallback uses it. Queue skip/gray depend on this helper.
3. **Queue unavailable + skip** — depends on 02’s helper and the playable-status join. Transport-only skip so tap/`playIndex` stay explicit.
4. **Living docs** — last so the pages describe the live probe, the named gate, and queue offline behavior.

## Out of scope

- Exclusive-formats cache and exclusive → HTML/OPFS.
- Auto-land on Downloads / last-route restore.
- Stream-fail → local while confirmed reachable.
- Queue / Downloads / tree `<img>` hitting `/api/cover`.
- Queue “Go to album/artist” preferring Downloads routes.
- Lyrics `allowNetwork` using confirmation.
- Play waiting on `downloads.ready`.
- Download-queue pump waiting on confirmation.
- Health probe when the download queue is empty.
- Default `cache: "no-store"` on all `apiGet`.
- Baking skip into `computeNextIndex` / changing `peekNextIndex`.
- Gray/skip when downloads are disabled.
- Auto-advance off the current track when reachability drops.
- SW-caching `/api/*`.
- A JS test runner.

## Assumptions

- Frontend verification is manual plus `rg`. No JS harness.
- Users on this path have an installed shell; exclusive off. Queue gray/skip requires downloads enabled and a hydrated `catalogIndex`.
- `/api/codecs` has no `Cache-Control` today; client `cache: "no-store"` is enough for the probe.
- `markDownloadBroken` on local fail stays; only the stream attempt is gated.
- Plan 026’s 4s abort + `reportFailure(err, 503)` stays.
- `trackDownloadState` / `joinDownloadUiStatus` is the playable join (`ready` | `other`).
