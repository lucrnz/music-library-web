# Exclusive audio (macOS companion)

Optional **hog / exclusive** playback on a Mac client while the music library server stays remote (NAS or other host).

## Get started

> **End-user guide.** Agents and developers: skip this section and continue at [Source of truth](#source-of-truth) below.

Use this when Musicweb is already running on your network and you want exclusive output on a **Mac**. macOS only for now.

1. **Server reachable** — open Musicweb in a browser on the Mac and confirm the library loads.
2. **Install the Mac PWA** — exclusive audio works from the **installed app**, not only a normal browser tab. You need a secure-context origin (`https://…` or `http://localhost` / `127.0.0.1`). See [Setup → PWA install and secure context](../setup.md#pwa-install-and-secure-context).
3. **Install mpv** on the Mac so it is on your `PATH` (example: `brew install mpv`). You can pass `--mpv /path/to/mpv` if it is installed elsewhere.
4. **Shared secret** — generate a token and use the **same** value for the companion and the app:

   ```sh
   openssl rand -hex 16
   ```

   Put it in the project `.env` (or the environment) as `HOG_TOKEN=…` on the Mac where you run the companion. You will paste the same string into the PWA in step 6.
5. **Run the companion on the Mac** (this is **not** the library server; it does not take the data-dir lock):

   ```sh
   uv run musicweb exclusive-audio
   # optional: --port 18765 (default)  --mpv /opt/homebrew/bin/mpv
   ```

   Leave this process running. It listens on `127.0.0.1` only (default port **18765**).
6. **PWA Settings → Exclusive audio** — enable exclusive, paste the same `HOG_TOKEN`, set the port if you changed it.
7. **Pick an output device** — first choice is manual; nothing is selected for you.
8. **Play a track** — status should show **Ready ·** your device name, and audio should come from the Mac via the companion, not the browser element.

CLI flags and env notes: [development/commands.md](../development/commands.md#exclusive-audio-companion-macos).

## Source of truth

- Companion CLI: `src/musicweb/cli/exclusive_audio.py`
- Companion package: `src/musicweb/exclusive/` (`protocol.py`, `app.py`, `session.py`, `mpv_player.py`, `coreaudio.py`, `volume.py`)
- Profile tags + catalog: `src/musicweb/transcode/profiles.py`
- HTTP: `GET /api/exclusive-formats`, existing `GET /api/stream` + `POST /api/transcode/prepare` with tags
- Client: `frontend/src/exclusive/` (including `statusFace.ts`, `companionClient.ts`), `stores/exclusiveAudio.ts`, `playback/sinks/`, `stores/player.ts`, `playbackStatus.ts`
- One-way imports: `exclusiveAudio.ts` persists prefs and accepts `setExclusiveLive`; it does not import `companionClient`. The client writes live fields through `setExclusiveLive`. `main.ts` and `ExclusiveAudioPanel` call `syncCompanionConnection` / `syncPreferredDevice` / `disconnectCompanion` directly.
- Companion hub: `src/musicweb/exclusive/session.py` (module-level `COMMANDS` table + `_with_live`). Load is the only start command. Store has no companion playing/paused mirrors.
- Device list items: `{ id, name, sample_rates, bit_depths }`
- Commands: `docs/development/commands.md`

## Architecture (prose)

1. **Library server** (anywhere on the LAN) indexes lossless files and encodes stream profiles into process-temp cache. Lossy-indexed tracks are **unavailable** in exclusive mode (`exclusive_lossy`) until a future remux plan — do not send MP3/AAC through companion FLAC encode. **Exclusive-mode radio is TODO.** Tune-in stops the hog; radio audio is HTML-only until a future exclusive-radio design. See `docs/systems/radio.md`.
2. **Mac PWA** (installed, standalone) enables exclusive mode, stores `HOG_TOKEN` + port, connects to `ws://127.0.0.1:<port>/ws`.
3. **Companion** (`musicweb exclusive-audio`) binds **127.0.0.1 only**, starts idle **mpv without** process-level `--audio-exclusive`, lists devices (Core Audio ∩ mpv), holds a **controller lock** (first successful hello).
4. **Controller + `set_device`** arms exclusive at runtime (`audio-exclusive=yes` + selected device). Exclusive is not engaged until the companion **accepts** a live device.
5. On play, the PWA **ensures** the preferred device is live, then builds an **absolute** stream URL (`new URL(streamPath, location.origin).href`) so mpv hits the **same host the browser uses**, not localhost on the Mac. It loads that URL into mpv with a **per-track exclusive FLAC tag**.

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
- Device caps for policy: **preference if still in the device list**, else live companion device.

## Preference vs live device

Two distinct client fields (do not conflate):

| Field | Meaning | Persisted |
|-------|---------|-----------|
| `selectedDeviceId` | User **preference** (what to re-apply) | yes (`localStorage`) |
| `companionDeviceId` | **Live** companion hog target (`selected_device_id` from status) | no |

- First device pick is **manual only** — no auto-pick of a default output.
- Preferred device **missing from the device list** → clear preference (and persist); if exclusive is playing, hard-stop and prompt to pick a device again.
- Companion status **never** overwrites preference; it only updates live.

## Arming, ensure-before-play, and hard-fail

**Armed** = exclusive **enabled** ∧ companion **connected** ∧ this tab is **controller** ∧ **live** device set (and still present in the device list when the list is non-empty). Preference alone is **not** armed.

| Situation | Behavior |
|-----------|----------|
| Enabled but not armed | Play **hard-fails** (no HTML audio, no OPFS) with a specific reason |
| Preference set, controller, live missing/mismatch | Client **`syncPreferredDevice`** sends `set_device`; play path **`ensurePreferredDevice`** (~1.5s) waits for live match |
| No preference / ensure timeout / device gone | `exclusive_needs_device` toast + open Settings |
| Companion offline / connecting / auth rejected | `exclusive_not_ready` |
| This tab read-only | `exclusive_readonly` |
| Armed | Companion sink only; absolute stream URL + exclusive tag |
| Mid-play companion death / TTL / live release | Immediate hard stop + toast; **no** browser fallback |
| Second tab | Read-only (“controlled elsewhere”); no steal in v1 |

Ensure/wait logic lives on the **companion client**, not as a timeout loop inside `playIndex`.

When exclusive is **enabled** (not only when armed), normal stream quality, download quality, and playback-policy controls are hidden/disabled.

### Client sync entry points

Single **`syncPreferredDevice`** when controller ∧ preference set ∧ (live missing or ≠ preference):

- controller `hello_ok`
- after devices list update (if preference still valid)
- user chooses a device
- ensure-before-play

## Now-playing face and details

While exclusive is **enabled**, the now-playing **primary face is always exclusive** (never “Streaming · codec”):

| Kind | Copy |
|------|------|
| `needs_device` | Needs device |
| `connecting` | Connecting… |
| `offline` | Companion offline |
| `rejected` | Auth rejected (or short safe error) |
| `readonly` | Controlled elsewhere |
| `ready` | Ready · {deviceName} |

Implementation: pure `static/js/exclusive/statusFace.js` — Settings panel uses the same helper.

**Playback details** (deep dive) hold Output Exclusive, Device, Profile tag, bit depth, sample rate from the **exclusive-formats** catalog (not browser `/api/codecs`).

## Lock, heartbeat, and exclusive release

- First successful `hello` becomes **controller**; further sessions are **readonly**.
- Client heartbeat ~5s; companion TTL ~15s without heartbeat releases the lock.
- Socket close also releases that session’s claim.
- Client always uses **`ws://127.0.0.1`** (not `localhost`) to avoid IPv6 mismatch.

### Controller owns the hog

- While a controller has a **live** device, that session **owns** exclusive/hog on Core Audio via mpv.
- **“Lock free”** only means the software controller claim is cleared. On controller loss the companion also **ensure-releases** hardware:
  1. Stop transport
  2. Set `audio-exclusive=no`, clear `audio-device`
  3. Clear companion `selected_device_id` (only after successful release) → client clears live
- Controller loss paths: **WebSocket disconnect** of the controller, or **heartbeat TTL** demotion (`role` → readonly, `reason=controller_ttl`).
- Never release on hello replace of the same session (reconnect reclaim without thrashing).
- User **preference** stays in PWA localStorage; on next controller `hello_ok` the client re-sends `set_device` via `syncPreferredDevice`.
- TTL with socket still open: client emits `error` with `code=controller_lost` so the existing exclusive hard-stop UI runs (not the WebSocket `disconnect` event).

## Volume

Digital **mpv** volume is required and must not block playback. Hog bypasses the Mac mixer, so exclusive at the in-app slider 100% is often quieter than browser playback unless analog gain is written.

When a hardware volume write succeeds, that write is the slider and mpv stays at unity. Otherwise the slider is digital mpv. Each apply picks the path independently. The companion re-applies after exclusive output is up, not only when the slider moves.

Pre-hog hardware volume is restored when exclusive is released, the output device changes, or the companion process stops. If that level could not be read, it is left alone. A crash or SIGKILL without a clean stop cannot restore.

Mac volume keys usually do nothing while hogged. The in-app slider is exclusive volume.

## Prepare while exclusive

- `getActiveStreamCodec()` is the browser Streaming setting and is unused for exclusive play/prepare.
- Exclusive prepare uses `getExclusiveProfileTag(track)` only; multi-tag queues call prepare **per tag group**.
- Near-end prepare uses the **next** track’s exclusive tag.
- Do not prewarm browser Opus/FLAC marketing codecs for the queue while exclusive is on.
- Advance on sink `ended` only (player owns repeat-one / next).

## Manual check: headphones free after controller loss

1. Armed exclusive (status **Ready · device**); play a track long enough that hog is clearly engaged.
2. Quit/close the PWA (not only hide).
3. Companion logs controller disconnect / lock free **and** exclusive device released; another app can use the headphones immediately.
4. Reopen PWA: reconnects as controller, preference re-applied via `set_device`, play works after ensure (exclusive re-armed).
5. TTL path: starve JS heartbeats until TTL while PWA stays open — hard-stop toast (`controller_lost`), role readonly, headphones free for other apps.

## Out of scope (v1)

- Gapless
- Media keys / menu bar app / Now Playing integration beyond existing browser Media Session
- Windows or Linux companion binary (protocol stays OS-agnostic)
- Bit-perfect play of on-disk library originals via companion
- Electron / TypeScript / Vite / pnpm
- Auth model change for exclusive tags
- Listing exclusive-only tags on the normal browser codec marketing list
- Auto-pick of a default output device

## Related

- `docs/setup.md` — operator on-ramp (server + PWA)
- `docs/development/commands.md` — companion CLI
- `docs/systems/playback.md` — browser delivery source and prepare
- `docs/systems/transcoding.md` — encode policy
- `docs/systems/pwa.md` — install / public origin
- `docs/architecture/technical-decisions.md` — stack choices
