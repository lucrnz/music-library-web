# Exclusive audio (macOS companion)

Optional **hog / exclusive** playback on a Mac client while the music library server stays remote (NAS or other host). The browser never hog-locks Core Audio; a local **companion** process owns mpv and talks to the installed Mac PWA over loopback WebSocket.

## Source of truth

- Companion CLI: `src/musicweb/cli/exclusive_audio.py`
- Companion package: `src/musicweb/exclusive/` (`protocol.py`, `app.py`, `session.py`, `mpv_player.py`, `coreaudio.py`)
- Profile tags + catalog: `src/musicweb/transcode/profiles.py`
- HTTP: `GET /api/exclusive-formats`, existing `GET /api/stream` + `POST /api/transcode/prepare` with tags
- Client: `src/musicweb/static/js/exclusive/`, `stores/exclusiveAudio.js`, `playback/sinks/`, `stores/player.js`
- Commands: `docs/development/commands.md`

## Architecture (prose)

1. **Library server** (anywhere on the LAN) indexes lossless files and encodes stream profiles into process-temp cache.
2. **Mac PWA** (installed, standalone) enables exclusive mode, stores `HOG_TOKEN` + port, connects to `ws://127.0.0.1:<port>/ws`.
3. **Companion** (`musicweb exclusive-audio`) binds **127.0.0.1 only**, starts idle **mpv** with `--audio-exclusive=yes`, lists devices (Core Audio ∩ mpv), holds a **controller lock** (first successful hello).
4. On play, the PWA builds an **absolute** stream URL (`new URL(streamPath, location.origin).href`) so mpv hits the **same host the browser uses**, not localhost on the Mac. It loads that URL into mpv with a **per-track exclusive FLAC tag**.

```
[ remote musicweb ] --HTTP FLAC stream tags--> [ mpv on Mac ]
       ^                                         ^
       | prepare / stream                        | IPC
       |                                         |
[ Mac PWA ] --ws://127.0.0.1:18765--> [ exclusive-audio companion ]
```

## Tags and catalog

- Grammar: `flac_{bit_depth}_{sample_rate}` (e.g. `flac_24_192000`).
- Full allowlist: rates `44100, 48000, 88200, 96000, 176400, 192000` × depths `16, 24` (12 tags).
- **No** separate exclusive stream routes: use `/api/stream?codec=<tag>` and `/api/transcode/prepare` with the same tag.
- `GET /api/codecs` lists **browser** profiles only. Exclusive tags are advertised via `GET /api/exclusive-formats`.
- Client **never invents** tags; `formatPolicy` only picks from the server catalog ∩ device caps.

## Format modes

- **`prefer_source`:** exact source rate/depth when allowlisted and device-supported; else nearest lower-or-equal; avoid pointless 16→24.
- **`upsample_device`:** highest allowlisted rate×depth the device supports, every track.
- Missing track tech → treat like device-max for that track; toast once per track id per session; server logs once per track id per process.

## Arming and hard-fail

**Armed** = exclusive **enabled** ∧ device selected ∧ companion **connected** ∧ this tab is **controller**.

| Situation | Behavior |
|-----------|----------|
| Enabled but not armed | Play **hard-fails** (no HTML audio, no OPFS) |
| Armed | Companion sink only; absolute stream URL + exclusive tag |
| Mid-play companion death / error | Immediate hard stop + toast; **no** browser fallback |
| Second tab | Read-only (“controlled elsewhere”); no steal in v1 |

When exclusive is **enabled** (not only when armed), normal stream quality, download quality, and playback-policy controls are hidden/disabled.

## Lock and heartbeat

- First successful `hello` becomes **controller**; further sessions are **readonly**.
- Client heartbeat ~5s; companion TTL ~15s without heartbeat releases the lock.
- Socket close also releases that session’s claim.
- Client always uses **`ws://127.0.0.1`** (not `localhost`) to avoid IPv6 mismatch.

## Volume

Digital **mpv** volume is required and always available. Core Audio hardware volume is best-effort and must not block playback.

## Prepare while exclusive

- `getActiveStreamCodec()` remains **browser Wi‑Fi/cellular only**.
- Exclusive prepare uses `getExclusiveProfileTag(track)` only; multi-tag queues call prepare **per tag group**.
- Near-end prepare uses the **next** track’s exclusive tag.
- Do not prewarm browser Opus/FLAC marketing codecs for the queue while exclusive is on.
- Advance on sink `ended` only (player owns repeat-one / next).

## Operator setup

1. On the Mac: install mpv; set a shared secret in project `.env` (or export it):

   ```sh
   # .env
   HOG_TOKEN=<openssl rand -hex 16>
   uv run musicweb exclusive-audio
   ```

   The companion loads `.env` the same way as the library server (cwd, then project root). Default port **18765** (`--port` to override). Does **not** take the library data-dir lock and is **not** the library server.

2. Install the musicweb PWA on that Mac (secure context / `MUSICWEB_PUBLIC_ORIGIN` rules apply — see `docs/systems/pwa.md`). LAN `http://IP` without secure context cannot install.

3. Settings → Exclusive audio: paste the same `HOG_TOKEN`, confirm port, enable, select device.

4. Play from the PWA; audio should leave the Mac via mpv exclusive, not the browser element.

## Out of scope (v1)

- Gapless
- Media keys / menu bar app / Now Playing integration beyond existing browser Media Session
- Windows or Linux companion binary (protocol stays OS-agnostic)
- Bit-perfect play of on-disk library originals via companion
- Electron / TypeScript / Vite / pnpm
- Auth model change for exclusive tags
- Listing exclusive-only tags on the normal browser codec marketing list

## Related

- `docs/systems/playback.md` — browser delivery source and prepare
- `docs/systems/transcoding.md` — encode policy
- `docs/systems/pwa.md` — install / public origin
- `docs/architecture/technical-decisions.md` — stack choices
