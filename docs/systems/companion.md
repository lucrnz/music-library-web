# Desktop companion

Loopback sidecar on the same machine as the installed desktop PWA. It is **not** the library server: no data-dir lock, no SQLite, no scan.

Two jobs share one process (`uv run musicweb companion`) and one `COMPANION_TOKEN`:

1. **Exclusive hog** (macOS) — mpv + Core Audio. See [exclusive-audio.md](exclusive-audio.md).
2. **Downloads blob store** — real-disk locker for the same Downloads feature the PWA catalogs in IndexedDB. See [downloads.md](downloads.md).

## Source of truth

- CLI: `src/musicweb/cli/companion.py`
- Hub, protocol, blob jail, loopback HTTP: `src/musicweb/exclusive/`
- Client socket + Settings: `frontend/src/exclusive/`, `frontend/src/components/settings/CompanionPanel.vue`
- Blob keys / worker / migrate: `frontend/src/downloads/companionBlob.ts`, `worker.ts`, `migrate.ts`
- Platform tiers: [product/core-guidelines.md](../product/core-guidelines.md)

## Behavior (intent)

- Binds **127.0.0.1 only**. mpv is required on macOS. Windows/Linux hog is a no-op stub so Downloads still start.
- Data files live in the OS app-support directory (printed on every launch). There is no env override.
- Hello + token authenticates a session. Any authenticated session may command the blob store. Hog transport (`load`, device, volume) stays **controller-only**.
- The companion fetches library stream URLs and writes jailed relative keys. The PWA plays those files over a token-gated loopback GET with Range. HTML and exclusive both consume that store.
- Auto-connect when Downloads **or** exclusive is enabled and a token is set. Enabling Downloads on a desktop PWA turns the flag on, waits for hello, then boots the queue. `hello_ok` / `disk_info` carry the data-dir path for Settings.
- Settings token/port commit runs a hello probe: green/red field border plus `Token accepted` / `Invalid token` / `Companion not reachable`. Feature-off probes hang up after hello so they do not take the controller lock. The companion logs hello rejects only (not the token).
- `DEBUG` (`true`/`1` vs `false`/`0`/unset) from the same `.env` or process env raises process logs to DEBUG, including exclusive volume path decisions (hardware vs digital, pre-hog adopt, restore, Core Audio selector outcome). Loopback HTTP access logs stay off so `?token=` does not hit stdout. WebSocket time-pos frames are not logged.
- Loopback file HTTP allows CORS and Private Network Access from the PWA origin so migrate PUT and cover fetch work. GET Range and migrate PUT stream; they do not slurp the whole file.

## Guardrails

- Do not bind off loopback.
- Do not take the library data-dir lock or open the server DB.
- Do not log file URLs (they carry the token). Companion HTTP access logs are off so `?token=` does not hit stdout.
- Do not give hog commands to a readonly session.
- Windows/Linux hog is a no-op stub; the process still runs for Downloads. Feature exceptions stay on [exclusive-audio.md](exclusive-audio.md), not in the product platform table.
