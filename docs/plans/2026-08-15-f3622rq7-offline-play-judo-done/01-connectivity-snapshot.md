# Stage 01: Connectivity snapshot

## Status
done

## Description

Notify when reachability **state or confirmed** changes. Mirror `canUseRemote` on the Vue store. Point `PlaylistView` at that field only.

## Rationale

Queue gray cannot see `reportSuccess` on an already-`online` boot without a fake state event. Publishing the snapshot deletes the hack and the `void` subscription.

## Invariants

- `canUseRemoteMedia()` / `canReachServer()` semantics unchanged.
- `setState` still no-ops when the enum is unchanged.
- Listeners may run when only `confirmed` flips (`from` and `to` state equal). Callers that assume `from !== to` must tolerate that (today they sync the store — fine).
- `PlaylistView` does not import `../connectivity.js`.

## Risks

- A listener that treats every callback as a real `online`↔`offline` transition could double-toast. Check `connectivityUi.js`: toast on `from !== to` only — keep that.

## Implementation

### Files

- Change `src/musicweb/static/js/connectivity.js`
- Change `src/musicweb/static/js/stores/connectivity.js`
- Change `src/musicweb/static/js/components/playlist/PlaylistView.js`

### Steps

1. In `connectivity.js`, extract a `notify(prevState)` used by `setState` and by confirm flips. `reportSuccess`: set `confirmed`, `setState("online")`; if confirm became true and `setState` did not notify (already online), `notify(prev)`. Delete the duplicated listener loop if `notify` is shared. Do not call listeners with a lie about `state` changing — passing equal from/to is the honest signal (“snapshot changed”).
2. Vue store: keep `state` and `confirmed`; add `canUseRemote`. `syncFromPlatform` sets all three from `getConnectivityState()`, `hasConfirmedReachability()`, `canUseRemoteMedia()`.
3. `rowUnavailable`: `downloads.enabled && !connectivity.canUseRemote && !isLocallyPlayableDownload(track?.id)`. Drop `void` lines and the platform import.

### Verify

- `rg "void connectivity" src/musicweb/static/js` — no matches.
- `rg "canUseRemoteMedia" src/musicweb/static/js/components/playlist/PlaylistView.js` — no matches.
- `rg "online, online|becameConfirmed" src/musicweb/static/js/connectivity.js` — no ad-hoc comment-loop; notify is shared.
- `rg "from !== to|prev !== next" src/musicweb/static/js/connectivityUi.js` — toasts still gated on a real state change.

## Acceptance

- [ ] Confirm flip while `state === "online"` updates `connectivity.canUseRemote` and lifts queue gray.
- [ ] No fake unique state transition; toasts do not double.
- [ ] PlaylistView’s offline class reads only the Vue store + catalog join.
