# Stage 03: Client logger, outbox, cookies, Settings cutoff

## Status
done

## Description

Ship a client diag module: stable `client_id`, IDB-backed outbox, flush to ingest, `/api` cookies + `api.js` headers, and a Settings Diagnostics `SettingsSelect` (**Errors only** / **Everything**) that sets the transmit cutoff and mints or clears `session_id`.

## Rationale

The phone cannot use remote DevTools reliably. After this stage the PWA can persist and upload **error** events by default, and a full timeline when Everything is selected — before any playback callsites exist.

## Invariants

- Callsites do not check the dropdown. `emit` no-ops when `level` is not `error` and mode is `errors`.
- Default mode is `errors`. Persist `musicweb.diag.mode`.
- `client_id` persists in `localStorage` key `musicweb.diag.clientId` (create UUID on first boot).
- `session_id` exists only in Everything (`musicweb.diag.sessionId`); switching to Errors only deletes it and the session cookie.
- Cookies: `Path=/api`, `SameSite=Lax`, `Secure` iff `https:`. Names match stage 02 including `musicweb_mode`. No `Domain`.
- IndexedDB name `musicweb-diag` (not `musicweb-downloads`). Outbox cap 500 events; drop oldest. Switching down to Errors only does **not** wipe an existing Everything outbox (those lines already qualified).
- `streamUrl()` unchanged. Ingest flush does not use `apiPost` (avoid error-handler recursion).
- `emit` never throws into callers; flush failures leave events in IDB.

## Risks

- Android may ignore `sendBeacon` to `/api` in some standalone cases; IDB replay on next launch is the backup.
- A full private-mode IDB failure: keep the in-memory ring and still POST.
- Default Errors only means `diag.boot` (info) will not appear until Everything + reload. Do not “fix” that by emitting boot as error.

## Implementation

### Files

- Create `src/musicweb/static/js/diag/log.js`
- Create `src/musicweb/static/js/diag/idb.js`
- Change `src/musicweb/static/js/api.js` (join-key + mode headers on existing helpers)
- Change `src/musicweb/static/js/main.js` (`initDiag()`)
- Change `src/musicweb/static/js/components/settings/SettingsModal.js` (Diagnostics section + `SettingsSelect`)
- Change `src/musicweb/static/css/` only if an existing settings class already covers the row (prefer existing `SettingsSelect` + `modal-hint`; no new theme)

### Steps

1. `idb.js`: open `musicweb-diag`, store `outbox` (autoincrement), `put`/`getAll`/`delete` by id. Swallow open errors and export `null` backend.
2. `log.js`: `initDiag()`, `emit(event, data, level="info")`, `beginPlay()` → new `play_id` + play cookie, `setMode("errors"|"everything")`, getters for ids/mode. If mode rejects `level`, return before memory/IDB. Else memory ring + IDB write; schedule flush.
3. `setMode("everything")` mints `session_id` and sets session + mode cookies. `setMode("errors")` clears `session_id` and the session cookie; keeps `client_id`.
4. Flush when `canReachServer()`: `POST /api/diag/events` with `keepalive`, batch ≤100, delete only acknowledged ids. On `visibilitychange` hidden / `pagehide`, `sendBeacon` remaining (same URL, JSON blob).
5. `apiGet`/`apiPost`/`apiPut`/`apiPatch`/`apiDelete`: set the three id headers plus `X-Musicweb-Mode` (omit an id header when that id is null; always send mode).
6. Settings: new section after `LibraryScanPanel`, title **Diagnostics**. `SettingsSelect` options `{ id: "errors", label: "Errors only" }` and `{ id: "everything", label: "Everything" }`. Show `client_id` always; show `session_id` when Everything. Copy uses `navigator.clipboard` + `showToast` — no `alert`. Hint: Errors only sends playback and other failures; Everything sends the full diagnostic timeline and labels a session.
7. `main.js` calls `initDiag()` before `registerServiceWorker()`. `initDiag` still calls `emit("diag.boot", …, "info")` (dropped on default).

### Verify

- `rg "streamUrl" -A 4 src/musicweb/static/js/api.js` — still only `id` and `codec` query params.
- `rg "musicweb-downloads" src/musicweb/static/js/diag` — no matches.
- `rg "apiPost\\(\"/api/diag" src/musicweb/static/js` — no matches (dedicated fetch).
- Manual: default Settings shows Errors only, no session id; DevTools cookies have `musicweb_mode=errors` and no `musicweb_session`.
- Manual: choose Everything → session id appears; reload → same `client_id` and session until switched back; `diag.boot` now in IDB/`events-*.jsonl`.
- Manual: Errors only + `emit` of an info event (boot) leaves outbox empty; a temporary `emit("x", {}, "error")` from the console (or wait for stage 04) writes a row.

## Acceptance

- [x] Default mode is Errors only; `diag.boot` is emitted and dropped.
- [x] Everything mints `session_id` + cookies; Errors only clears the session only.
- [x] Mode and join-key headers appear on a normal `apiGet`.
- [x] Killing the tab with the server stopped leaves **already-accepted** outbox rows; restarting the server and reloading drains them (at-least-once).
