**Archive.** Decisions in this file were current as of 2026-09-02 (the plan date in the directory name). They may be outdated. Do not treat this as living documentation. This plan directory is an archive.

# Companion lazy mpv

## Goal

The Desktop companion must not keep an idle mpv process (or launch `mpv --audio-device=help`) just because `musicweb companion` is running. Spawn the player process only when a command actually needs it (`set_device` or `load`). Quit it as soon as nothing is loaded and no output device is selected. Downloads-only, optical watch, and hello stay process-free.

## Settled decisions

- **Keep-alive set.** A live mpv process is justified only while a hog device is selected **or** a URL is loaded (exclusive play or exclusive-off CD). Optical watch, sitting in the CD room, exclusive enabled with no device, and a Downloads-only socket do not keep it up.
- **Spawn triggers.** `set_device` and `load` are the only commands that start the process. Hub may call `start()` immediately before those two. `use_auto_output` does not spawn; exclusive-off CD is `start` → `use_auto_output` → `load`.
- **Quit immediately.** When the last keep-alive ends, tear the process down with no grace timer. Triggers: `release_device`, exclusive-off `stop` (no selected device and no URL), 60s controller TTL, controller disconnect. Mid-play exclusive toggle (release then reload) pays one respawn.
- **Transport while down.** `pause`, `resume`, `seek`, `set_volume`, `stop`, `release_device`, and `use_auto_output` do not spawn and do not error. `stop` / `release_device` still clear local url/device the way they do today. `set_volume` may remember the user value for the next spawn.
- **Boot.** Companion lifespan does not start mpv and does not call `list_output_devices`. First `list_devices` still runs the short-lived `mpv --audio-device=help` merge. macOS/Windows still refuse to start the companion if the mpv **binary** is missing. Linux stub unchanged.
- **Death vs quit.** Unexpected IPC close still fans out the existing error so an in-flight play hard-stops. Intentional shutdown must not emit that error. A dead process is the same as never-started: the next `set_device` / `load` respawns.
- **No protocol or PWA change.** No new WebSocket fields or messages. Existing `set_device`, `load`, `stop`, and `release_device` are sufficient. Leave-CD already stops transport.
- **Object vs process.** One `MpvPlayer` lives for the companion process. Only the OS child is lazy. `close()` on companion exit stays final.

## Design

Today `ExclusiveHub.start_player()` (FastAPI lifespan) launches idle mpv (`--idle=yes`) and pre-lists devices. `release_device` unhogs and **keeps** that child. Device listing on macOS/Windows also runs a one-shot `mpv --audio-device=help` at boot.

After this plan the hub still constructs `MpvPlayer` at init. Lifespan only binds the event loop and starts the TTL watch. The child appears on the first `set_device` or `load`, and disappears as soon as `selected_device_id` and the loaded URL are both empty.

```
companion start
    │
    ▼
no mpv child          list_devices ──► one-shot --audio-device=help
    │
    ├─ set_device ──► start + hog
    ├─ load (hog) ──► start (device already required)
    └─ load (auto) ──► start + audio-device=auto + loadfile
           │
           ▼
    keep while device or url
           │
           ├─ stop + device still set ──► process stays (hog / Tune-in)
           └─ release / exclusive-off stop / TTL / disconnect
                    │
                    ▼
              quit child now
```

`MpvPlayer.start()` stays idempotent. A new `shutdown_process()` (name may vary) tears down IPC, threads, and the child, then resets so `start()` can run again. `close()` calls that path and then refuses further starts (companion exit).

Hog semantics do not change: armed exclusive still holds the device via a live child; 60s idle TTL still unhogs; Tune-in `stop` is still transport-only. Exclusive-off CD already sends `stop` on leave (`cdStopTransport`), which becomes the quit.

## Stage map

Stage 01 first: the player object cannot be stopped and started again (`close()` sets `_closed` permanently and idle `release_device` leaves the child up). Hub policy cannot be honest until that seam exists and is tested without a real mpv.

Stage 02 depends on 01. It is the product change: lifespan no longer starts or lists, hub spawns on `set_device`/`load` and quits when idle. Fake players in hub/optical tests grow the new methods.

Stage 03 depends on 02. Living systems pages still say the companion “starts idle mpv” and that `release_device` “keeps idle mpv”. Those sentences must match the wired policy so the plan directory is not the source of truth.

## Out of scope

- New WebSocket messages or a `mpv_running` status field
- Frontend / PWA changes
- Dropping the macOS/Windows “mpv binary required at launch” check
- Changing hog arming, 60s TTL length, or controller lock rules
- Replacing the one-shot `mpv --audio-device=help` merge used by `list_devices`
- Linux hog implementation
- Pre-warming on optical watch or exclusive-toggle-without-device

## Assumptions

- Leave-CD and exclusive-off already send `stop` / `release_device`; the companion can infer idle from those commands.
- First exclusive-off CD `load` and a mid-play exclusive toggle may pay one spawn + IPC connect (typically well under the 8s join timeout).
- Tests must not launch a real mpv; lifecycle tests monkeypatch `popen` / IPC.
- Updating `docs/systems/exclusive-audio.md`, `docs/systems/companion.md`, and `docs/systems/cd-playback.md` is enough for the decision to outlive this plan. No new ADR.
