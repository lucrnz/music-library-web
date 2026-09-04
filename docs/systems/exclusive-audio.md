# Exclusive audio (macOS / Windows companion)

Optional **hog / exclusive** playback on a Mac or Windows client while the music library server stays remote (NAS or other host). Support is best-effort; the project is NO WARRANTY. Linux hog stays a stub (the companion still serves Downloads there).

## Get started

> **End-user guide.** Agents and developers: skip this section and continue at [Source of truth](#source-of-truth) below.

Use this when Musicweb is already running on your network and you want exclusive output on a **Mac or Windows** PC.

1. **Server reachable** — open Musicweb in a browser on that computer and confirm the library loads.
2. **Install the desktop PWA** — exclusive audio works from the **installed app**, not only a normal browser tab. You need a secure-context origin (`https://…` or `http://localhost` / `127.0.0.1`). See [Setup → PWA install and secure context](../setup.md#pwa-install-and-secure-context).
3. **Install mpv** so it is on your `PATH` (example: `brew install mpv` on macOS). You can pass `--mpv /path/to/mpv` if it is installed elsewhere. Windows needs a full mpv that can open WASAPI exclusive.
4. **Shared secret** — generate a token and use the **same** value for the companion and the app:

   ```sh
   openssl rand -hex 16
   ```

   Put it in the project `.env` (or the environment) as `COMPANION_TOKEN=…` on the computer where you run the Desktop companion. You will paste the same string into the PWA in step 6.
5. **Run the Desktop companion on that same computer** (this is **not** the library server; it does not take the data-dir lock):

   ```sh
   uv run musicweb companion
   # optional: --port 18765 (default)  --mpv /opt/homebrew/bin/mpv
   ```

   Leave this process running. It listens on `127.0.0.1` only (default port **18765**).
6. **PWA Settings → Desktop companion** — paste the same `COMPANION_TOKEN`, set the port if you changed it. The token field turns green when the companion accepts it (red if the secret is wrong or nothing is listening). Then **Exclusive audio** — enable exclusive.
7. **Pick an output device** — first choice is manual; nothing is selected for you.
8. **Play a track** — status should show **Ready ·** your device name, and audio should come from this computer via the companion, not the browser element.

CLI flags and env notes: [development/commands.md](../development/commands.md#desktop-companion).

## Source of truth

- Companion CLI: `src/musicweb/cli/companion.py`
- Companion package: `src/musicweb/exclusive/` (`protocol.py`, `app.py`, `session.py`, `optical_session.py`, `mpv_player.py`, `mpv_ipc.py`, `coreaudio.py`, `wasapi.py`, `volume.py`). CD uses the same mpv: hog if exclusive is on (hard-fail if unarmed), auto if exclusive is off (`load` hog flag). Yellow Book hog wraps the as-is `/cdrom/file` URL; `cdLoad` does not use `exclusiveDelivery`. A hog failure on an odd FLAC/ALAC rate is honest. Exclusive-off CD still watches the tray. Compact status while CD is on is the CD face, not exclusive Ready. Mid-play exclusive toggle reloads the CD URL. See [cd-playback.md](cd-playback.md).
- Profile tags + catalog: `src/musicweb/transcode/profiles.py`
- HTTP: `GET /api/exclusive-formats`, existing `GET /api/stream` + `POST /api/transcode/prepare` with tags
- Client: `frontend/src/exclusive/` (including `statusFace.ts`, `companionClient.ts`), `stores/exclusiveAudio.ts`, `playback/exclusiveDelivery.ts`, `playback/sinks/`, `radio/audio.ts`, `stores/player.ts`, `playbackStatus.ts`
- One-way imports: `exclusiveAudio.ts` persists prefs and accepts `setExclusiveLive`; it does not import `companionClient`. The client writes live fields through `setExclusiveLive`. `main.ts`, `CompanionPanel`, and `ExclusiveAudioPanel` call `syncCompanionConnection` / `syncPreferredDevice` / `disconnectCompanion` directly. Token and port live on **Desktop companion** Settings.
- Companion hub: `src/musicweb/exclusive/session.py` (module-level `COMMANDS` table + `_with_live`). Load is the only start command. Store has no companion playing/paused mirrors.
- Device list items: `{ id, name, sample_rates, bit_depths }`
- Commands: `docs/development/commands.md`

## Architecture (prose)

1. **Library server** (anywhere on the LAN) indexes lossless files and encodes stream profiles into process-temp cache. Lossy-indexed tracks play exclusive via a local download or an mpv `source` stream — do not remux MP3/AAC through a companion FLAC tag. Household radio on this computer uses the same exclusive delivery into mpv and seeks the station clock; Tune-in keeps hog armed (`stop` is transport-only). Unarmed exclusive Tune-in hard-fails (no HTML). See `docs/systems/radio.md`. **Linux hog is a no-op stub**; the companion still runs there for Downloads ([companion.md](companion.md)).
2. **Desktop PWA** (installed, standalone, macOS or Windows) enables exclusive mode, stores `COMPANION_TOKEN` + port, connects to `ws://127.0.0.1:<port>/ws`.
3. **Desktop companion** (`musicweb companion`) binds **127.0.0.1 only**, starts with **no mpv child**. `set_device` / `load` spawn mpv without a process-level `--audio-exclusive`. First `list_devices` (not boot) lists Core Audio ∩ mpv on macOS or WASAPI ∩ mpv on Windows. Holds a **controller lock** (first successful hello). Windows JSON IPC is a named pipe.
4. **Controller + `set_device`** arms exclusive at runtime (`audio-exclusive=yes` + selected device). Exclusive is not engaged until the companion **accepts** a live device.
5. On play, the PWA **ensures** the preferred device is live, then applies the same **When a download exists** policy as HTML. A companion locker file is a loopback GET into mpv. Otherwise lossless uses an **absolute** exclusive FLAC tag URL (`new URL(streamPath, location.origin).href`) so mpv hits the **same host the browser uses**; lossy streams `source`. Leftover OPFS files stay HTML-only until migrate Yes.

```
[ remote musicweb ] --HTTP stream (FLAC tag or source)--> [ mpv on this computer ]
       ^                                                    ^
       | prepare / stream                                   | IPC / loopback file
       |                                                    |
[ desktop PWA ] --ws://127.0.0.1:18765--> [ Desktop companion ]
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
| Armed | Companion sink only; local locker URL when policy prefers a download, else exclusive FLAC tag or lossy `source` stream |
| Mid-play companion death / TTL / live release | Immediate hard stop + toast; **no** browser fallback |
| Second tab | Read-only (“controlled elsewhere”); no steal in v1 |

Ensure/wait logic lives on the **companion client**, not as a timeout loop inside `playIndex`.

When exclusive is **enabled**, the Streaming picker is hidden (exclusive lossless uses device-capped FLAC tags). Downloads quality and **When a download exists** stay visible: exclusive applies the same policy and may load a companion locker file into mpv. Leftover OPFS stays HTML-only and is not sent to mpv (stream instead).

### Client sync entry points

Single **`syncPreferredDevice`** when exclusive is **enabled** ∧ controller ∧ preference set ∧ (live missing or ≠ preference):

- controller `hello_ok`
- after devices list update (if preference still valid)
- user chooses a device
- ensure-before-play
- exclusive turned on while the Downloads socket is already open

`syncCompanionConnection` after exclusive **off** (socket still wanted for Downloads) sends `release_device` instead.

## Now-playing face and details

While exclusive is **enabled**, the now-playing **primary face is always exclusive** for queue and radio (never “Streaming · codec”):

| Kind | Copy |
|------|------|
| `needs_device` | Needs device |
| `connecting` | Connecting… |
| `offline` | Companion offline |
| `rejected` | Auth rejected (or short safe error) |
| `readonly` | Controlled elsewhere |
| `ready` | Ready · {deviceName} |

Implementation: pure `static/js/exclusive/statusFace.js` — Settings panel uses the same helper.

**Playback details** (deep dive) hold Output Exclusive, Device, then either exclusive-formats Profile / bit depth / sample rate (lossless) or source-format rows (lossy: codec, bitrate, encoding, file rate — not Profile: source).

## Lock, heartbeat, and exclusive release

- First successful `hello` becomes **controller**; further sessions are **readonly**.
- Client heartbeat ~5s (also on become-visible). After **60s** with no inbound traffic and nothing loaded in mpv, the companion **unhogs and quits the mpv child** (crash / half-open socket safety). A later message from the same session **reclaims** the lock and re-arms the last device (`set_device` respawns). A loaded stream is not idle — hog and the child stay.
- Turning **exclusive off** sends `release_device` immediately (even if mpv still has a track). The hog drops, and the mpv child is quit when nothing is loaded and no device is selected, so the headphones are free for other apps. The companion socket may stay open for Downloads. The queue/radio face keeps the same track and continues on the HTML sink. Mid-play exclusive toggle may respawn mpv on the next `load`.
- Socket close also releases that session’s claim (the clean goodbye path).
- Client always uses **`ws://127.0.0.1`** (not `localhost`) to avoid IPv6 mismatch.

### Controller owns the hog

- While a controller has a **live** device, that session **owns** exclusive/hog on Core Audio via mpv.
- **“Lock free”** only means the software controller claim is cleared. On controller loss the companion also **ensure-releases** hardware:
  1. Stop transport
  2. Set `audio-exclusive=no`, clear `audio-device`
  3. Clear companion `selected_device_id` (only after successful release) → client clears live
- Controller loss paths: **WebSocket disconnect**, or **60s idle TTL** (`role` → readonly, `reason=controller_ttl`) while nothing is loaded. Both unhog and quit the mpv child when idle. TTL does not toast or close the socket; the same session reclaims on the next heartbeat / visibility / command and re-arms the last device (`set_device` respawns).
- User **disables exclusive** (`release_device`): unhog now and quit the mpv child when nothing is loaded and no device is selected; keep the controller claim and the Downloads socket. Re-enable re-sends `set_device` (respawns). `set_device` is not sent while exclusive is off.
- Never release on hello replace of the same session (reconnect reclaim without thrashing).
- User **preference** stays in PWA localStorage; on next controller `hello_ok` (or reclaim) the client re-sends `set_device` via `syncPreferredDevice`.

## Volume

Digital **mpv** volume is required and must not block playback. Hog bypasses the Mac mixer, so exclusive at the in-app slider 100% is often quieter than browser playback unless analog gain is written.

When a hardware volume write succeeds, that write is the slider and mpv stays at unity. Otherwise the slider is digital mpv. Each apply picks the path independently. The companion re-applies after exclusive output is up, not only when the slider moves. `DEBUG=true` / `1` on the companion process logs those path decisions.

When exclusive is enabled and a device is selected, the companion reads that device’s current (pre-hog) hardware volume, uses it as the slider, and the first status `volume` for that live device updates the in-app face. Later status messages do not move the slider; the in-app control is the source of truth after adopt, and status must not be written back as `set_volume`. Re-selecting the same live device does not re-read. If the level could not be read, the slider is left alone.

Pre-hog hardware volume is restored when exclusive is released, the output device changes, or the companion process stops. If that level could not be read, it is left alone. A crash or SIGKILL without a clean stop cannot restore.

Mac volume keys usually do nothing while hogged. The in-app slider is exclusive volume.

## Prepare while exclusive

- `getActiveStreamCodec()` is the browser Streaming setting and is unused for exclusive play/prepare.
- Exclusive prepare uses `getExclusiveProfileTag(track)` only; multi-tag queues call prepare **per tag group**. Lossy / `source` is never prepared.
- Near-end prepare uses the **next** track’s exclusive tag.
- Exclusive radio may urgent-prepare the **current** exclusive tag only (household `tune_in` stays a browser codec).
- Do not prewarm browser Opus/FLAC marketing codecs for the queue while exclusive is on.
- Do not toast “source format unknown — using device max” for lossy exclusive.
- Advance on sink `ended` only (player owns repeat-one / next).

## Manual check: headphones free after controller loss

1. Armed exclusive (status **Ready · device**); play a track long enough that hog is clearly engaged.
2. Quit/close the PWA (not only hide).
3. Companion logs controller disconnect / lock free **and** exclusive device released; another app can use the headphones immediately.
4. Reopen PWA: reconnects as controller, preference re-applied via `set_device`, play works after ensure (exclusive re-armed).
5. Idle (nothing playing) for ~60s: hog releases so another app can use the headphones. Come back — no timeout toast; heartbeat reclaim re-arms the last device (**Ready · device**). Quit/crash still releases immediately on socket close.

## Out of scope (v1)

- Gapless
- Media keys / menu bar app / Now Playing integration beyond existing browser Media Session
- Linux hog (stub — companion still serves Downloads)
- Bit-perfect “always store library originals” as the locker format
- Electron / TypeScript / Vite / pnpm
- Auth model change for exclusive tags
- Listing exclusive-only tags on the normal browser codec marketing list
- Auto-pick of a default output device

## Related

- `docs/setup.md` — operator on-ramp (server + PWA)
- `docs/development/commands.md` — companion CLI
- `docs/systems/companion.md` — sidecar process (blob store + hog)
- `docs/systems/playback.md` — browser delivery source and prepare
- `docs/systems/transcoding.md` — encode policy
- `docs/systems/pwa.md` — install / public origin
- `docs/product/core-guidelines.md` — platform support tiers
- `docs/architecture/technical-decisions.md` — stack choices
