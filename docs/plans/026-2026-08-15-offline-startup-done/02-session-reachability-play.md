# Stage 02: Session reachability and play

## Status
done

## Description

Track whether this page lifetime has seen a successful API. Play (and player remote covers) treat the server as reachable only after that. The boot codecs GET becomes a timed reachability probe.

## Rationale

Optimistic `online` plus an unclassified codecs fetch lets play pick `/api/stream` while the LAN server is down. Session confirmation + a boot probe closes that window without a boot “Can’t reach server” toast.

## Invariants

- `canReachServer()` stays `state === "online" && !browserOffline()`. No new `ConnectivityState`.
- `hasConfirmedReachability()` is false at script load; `reportSuccess()` sets it true; it is not cleared on `offline` / `server_down`.
- `playHtml` → `resolvePlaySource` uses `offline: !(canReachServer() && hasConfirmedReachability())`.
- Player remote cover URLs use the same conjunct so Media Session does not point at `/api/cover` before confirmation.
- Prepare, lyrics, download queue, and library loaders stay on `canReachServer()` (library still tries browse).
- Codecs GET timeout is reported as `server_down` (`reportFailure` with HTTP 503 so `AbortError` is not classified as `abort`).
- Successful non-empty or empty-but-HTTP-OK codecs response calls `reportSuccess()`. Empty `codecs` still does not replace the cache (stage 01 rule).
- Plan 018: no stream-fail → local while `canReachServer()` **and** the session is confirmed.

## Risks

- `prefer_stream` + existing download: a play tap in the few hundred milliseconds before codecs returns plays local. Accept; after confirmation the next play follows policy.
- A hung host without timeout would leave play on local forever if the user never triggers another API. The timeout exists so confirmation-or-`server_down` always settles.
- `settings.js` must report via platform `connectivity.js`, not the Vue store (avoid a store cycle; bind order still mirrors state).

## Implementation

### Files

- Change `src/musicweb/static/js/connectivity.js`
- Change `src/musicweb/static/js/stores/settings.js`
- Change `src/musicweb/static/js/stores/player.js`
- Change `src/musicweb/static/js/main.js`
- Change `src/musicweb/static/js/api.js` only if `apiGet` needs an `init` / `signal` pass-through (prefer this over a second fetch helper)

### Steps

1. In `connectivity.js`, add `let reachabilityConfirmed = false`, `export function hasConfirmedReachability()`, and set the flag `true` at the start of `reportSuccess()` (including the `browserOffline()` early path is unnecessary — `reportSuccess` already bails to `offline` there; still set the flag only when you actually treat the server as up: set it when calling `setState("online")`).
2. Give `apiGet` an optional `init` (or `signal`) forwarded to `apiFetch`, same as the other verbs if they already spread `init`.
3. In `main.js`, call `bindConnectivityStore()` **before** `loadCodecs()` so the Vue mirror sees the first report. Keep downloads bind after that as today.
4. In `loadCodecs` (the **fetch** branch only): `AbortController` + **4000 ms** timeout. `apiGet("/api/codecs", { signal })`. `finally` clear the timer. On fulfilled response: `reportSuccess()` then existing cache/apply/prefs. On reject: if the abort fired, `reportFailure(err, 503)`; else `reportFailure(err)` (HTTP errors from `apiGet` have no status today — `TypeError` / “Failed to fetch” already classify as `server_down`). Keep `console.error`. Do not `reportSuccess` from the cache-hydrate path.
5. In `playHtml`, set `offline: !(canReachServer() && hasConfirmedReachability())`. In `updateMediaSession`, set `allowRemote` with the same conjunct. Do not change `issueNearEndPrepare` or other `canReachServer()` sites in this stage.
6. Do not add stream-fail → local.

### Verify

- `rg "hasConfirmedReachability" src/musicweb/static/js` — defined in `connectivity.js`; used from `player.js` (play + covers); not used to redefine `canReachServer`.
- `rg "canReachServer\\(\\)" src/musicweb/static/js/stores/player.js` — prepare / remaining sites unchanged; play resolve and cover `allowRemote` use the conjunct.
- `rg "reportFailure\\(err, 503\\)" src/musicweb/static/js/stores/settings.js` — timeout path exists.
- Manual, airplane mode: play a downloaded track from the restored queue or Downloads tab; source is `downloaded`; Settings still shows cached quality (stage 01).
- Manual, Wi‑Fi on, library server stopped: open the PWA, immediately play a downloaded track (before the folders error). Source is `downloaded`, not `play_failed`. After the codecs timeout, connectivity is `server_down` (quiet toast). Folders may still show the existing load error.
- Manual, server up: first play after codecs returns still follows `prefer_better` / `prefer_stream` / `prefer_offline` as today.

## Acceptance

- [ ] Play does not request `/api/stream` until `reportSuccess` has run this page lifetime, when a playable download exists.
- [ ] Hard offline and already-`server_down` still take the existing local-or-unavailable path.
- [ ] Boot codecs failure/timeout reports `server_down`; success reports reachable.
- [ ] No stream-fail → local branch added.
- [ ] `canReachServer()` semantics unchanged for prepare and the download queue.
