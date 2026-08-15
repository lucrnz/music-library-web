# Connectivity

Client model for **reachability** (can we talk to this origin’s server?) and **connection cost hints** (cellular vs unrestricted). Consumers — downloads queue, player, loaders — own their reactions; this system owns state and signals.

## Source of truth

- Platform state and probes: `src/musicweb/static/js/connectivity.js`
- Reactive SPA mirror: `src/musicweb/static/js/stores/connectivity.js`
- Quiet transition toasts: `src/musicweb/static/js/connectivityUi.js`
- Connection type / Data Saver hints: `src/musicweb/static/js/networkConstraints.js`
- Consumers: `src/musicweb/static/js/downloads/queuePolicy.js`, `src/musicweb/static/js/stores/player.js`, `src/musicweb/static/js/stores/settings.js`
- Related: `docs/systems/downloads.md`, `docs/systems/playback.md`, `docs/systems/pwa.md`

## Reachability states

Three published states (`ConnectivityState`):

| State | Intent |
|-------|--------|
| `online` | Browser reports online and the app treats the server as reachable |
| `offline` | Browser reports offline (hard offline) |
| `server_down` | Browser online but health / failure classification says the app server is not usable |

Truth and probes live in non-Vue `connectivity.js`. The Vue store mirrors state for templates. Success/failure reporters from API helpers feed classification (network vs item failure vs abort).

Boot is **optimistic** `online` so the shell does not flash “Can’t reach server.” `canReachServer()` stays `state === "online"` and not browser-offline — prepare, download-queue policy, and library loaders use that. Play and player remote covers also require `hasConfirmedReachability()`, set when `reportSuccess()` treats the server as up this page lifetime (codecs, browse, or health). `GET /api/codecs` at boot is that first probe: success confirms; failure or timeout reports `server_down`. No fourth published state.

### Health probes

When downloads are enabled and the queue has work (or other callers request a probe), a backoff health loop checks whether the server is back. Recovery notifies listeners so queue policy can resume and playback can retry prepare paths. Exact intervals and probe endpoints live in source.

### Auto-pause signal

`autoPauseReason()` (and downloads’ extension for metered links) answers whether background download work should freeze for offline, server-down, or constrained network — not whether the user pressed pause.

## Connection constraints

Separate from reachability: the Network Information API (when `connection.type` is available) reports cellular / Data Saver-style constraints.

- Used to pick cellular vs Wi‑Fi stream quality and to honor “only download on Wi‑Fi.”
- When type is not detectable (typical desktop), treat as unrestricted and hide cellular-only UI.
- Never a substitute for explicit quality or download settings.

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
