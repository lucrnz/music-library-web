# Connectivity

Client model for **reachability** (can we talk to this origin’s server?). Consumers — downloads queue, player, loaders — own their reactions; this system owns state and signals.

## Source of truth

- Platform state and probes: `frontend/src/connectivity.ts`
- Reactive SPA mirror: `frontend/src/stores/connectivity.ts`
- Quiet transition toasts: `frontend/src/connectivityUi.ts`
- Consumers: `frontend/src/downloads/queuePolicy.ts`, `frontend/src/stores/player.ts`, `frontend/src/stores/settings.ts`
- Related: `docs/systems/downloads.md`, `docs/systems/playback.md`, `docs/systems/pwa.md`

## Reachability states

Three published states (`ConnectivityState`):

| State | Intent |
|-------|--------|
| `online` | Last live same-origin `/api` success treated the library as reachable |
| `offline` | Last classified failure happened while the browser reported offline |
| `server_down` | Last classified failure happened while the browser reported online |

Published state follows **this origin’s last live `/api` result**, not Chromium’s `navigator.onLine`. `apiFetch` (`frontend/src/api.ts`) reports success on `res.ok` and failure on network throws, 429, and 5xx. 4xx does not flip connectivity. Health probes (`GET /api/health`) use the same reporters. Window `online` / `offline` only start a health probe; they do not set state. After a **failed** request, `navigator.onLine` may only choose Offline vs Can’t-reach copy.

Truth and probes live in non-Vue `connectivity.ts`. The Vue store mirrors state for templates.

Boot is **optimistic** `online` so the shell does not flash “Can’t reach server.” `canReachServer()` is `state === "online"` and does not read the browser flag. Play, remote covers, local-fail stream fallback, and queue skip use `canUseRemoteMedia()` (`canReachServer()` and `hasConfirmedReachability()`). The Vue store mirrors `state`, `confirmed`, and `canUseRemote`; queue gray reads `connectivity.canUseRemote`. Listeners fire when **state or confirmed** changes (`from`/`to` may be equal). `reportSuccess()` always confirms and sets `online`, including when `navigator.onLine === false`. `GET /api/codecs` at boot is still a first probe (`cache: "no-store"`). No fourth published state.

### Health probes

The backoff health loop runs while published state is `offline` or `server_down`, or a probe was requested — even when the download queue is empty. `setHealthWork` (`"downloads"` / `"artist-art"`) still exists for those pumps; it is not required to start a probe. Window events and empty-queue recovery call `requestHealthProbe`. Preferred-art flush re-arms with `reportFailure` + `requestHealthProbe`. Recovery notifies listeners so queue policy can resume, pending artist-art can flush, companion backfill can start, and playback can retry prepare paths. Exact intervals and probe endpoints live in source.

### Auto-pause signal

`autoPauseReason()` answers whether background download work should freeze for offline or server-down — not whether the user pressed pause.

## UX policy

- Connectivity UX is **quiet**: transition toasts via `connectivityUi.js` at boot; no full-screen offline mode.
- PWA shell offline (open the app without the host) is not the same as media offline — see `docs/systems/pwa.md`. Offline **music** still requires Downloads (OPFS).
- Guidance banners that mention downloads belong with downloads enablement, not as a second connectivity state machine.

## Guardrails

- Connectivity owns **state and signals**; downloads and player own **pause, play-block, and retry** reactions.
- Do not conflate “PWA not installable on plain LAN HTTP” with connectivity failure.
- Do not treat service worker shell cache as proof the API is up — `/api/*` is network-only.
- Do not re-export connectivity notifiers through the downloads package barrel.
- Keep probe/backoff numbers in source unless they become product contracts.
