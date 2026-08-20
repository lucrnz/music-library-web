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
| `online` | Browser reports online and the app treats the server as reachable |
| `offline` | Browser reports offline (hard offline) |
| `server_down` | Browser online but health / failure classification says the app server is not usable |

Truth and probes live in non-Vue `connectivity.js`. The Vue store mirrors state for templates. Success/failure reporters from API helpers feed classification (network vs item failure vs abort).

Boot is **optimistic** `online` so the shell does not flash “Can’t reach server.” `canReachServer()` stays `state === "online"` and not browser-offline — prepare, download-queue policy, and library loaders use that. Play, player remote covers, local-fail stream fallback, and queue skip use `canUseRemoteMedia()` (`canReachServer()` and `hasConfirmedReachability()`). The Vue store mirrors `state`, `confirmed`, and `canUseRemote`; queue gray reads `connectivity.canUseRemote`. Listeners fire when **state or confirmed** changes (`from`/`to` may be equal). `reportSuccess()` sets the session flag when it treats the server as up (codecs, browse, or health). `GET /api/codecs` at boot is that first probe and is not served from HTTP cache (`cache: "no-store"`); success confirms; failure or timeout reports `server_down`. No fourth published state.

### Health probes

A backoff health loop runs when **any** `setHealthWork` source has work (`"downloads"` or `"artist-art"`). Downloads still write `"downloads"` through `setHealthContext`. Preferred-art flush re-arms with `reportFailure` + `requestHealthProbe`, not “wait for recovered.” Recovery notifies listeners so queue policy can resume, pending artist-art can flush, and playback can retry prepare paths. Exact intervals and probe endpoints live in source.

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
