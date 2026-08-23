**Archive.** Decisions in this file were current as of 2026-08-23 (the plan date in the directory name). They may be outdated. Do not treat this as living documentation. This plan directory is an archive.

# Desktop companion command rename

## Goal

Rename the Mac sidecar process from `musicweb exclusive-audio` to **Desktop companion** (`uv run musicweb companion`) and rename its shared secret from `HOG_TOKEN` to `COMPANION_TOKEN`. Exclusive audio stays the playback feature.

## Settled decisions

- **Desktop companion** is the product name for the Mac sidecar process. It may grow later. This plan is a rename only: no new capabilities, no Typer group, no extra verbs.
- Exact argv: `uv run musicweb companion`. Hard-cut `exclusive-audio` (not hidden, not aliased).
- Exclusive audio remains the feature: Settings panel title **Exclusive audio (macOS)**, `HOG` Core Audio language, `/api/exclusive-formats`, `src/musicweb/exclusive/`, `frontend/src/exclusive/`, and `docs/systems/exclusive-audio.md` as the filename.
- CLI module matches the command: `src/musicweb/cli/companion.py` with `companion` / `run_companion`. Delete `src/musicweb/cli/exclusive_audio.py`.
- Process identity is `musicweb companion` everywhere operators can see it: Typer help, startup banner, FastAPI title. Help names Desktop companion and that its current job is exclusive audio via mpv hog + loopback WebSocket.
- Settings keeps the Exclusive audio title. Only the run snippet and token field label change (`COMPANION_TOKEN=… uv run musicweb companion`).
- Shared secret: env `COMPANION_TOKEN` only (`HOG_TOKEN` is not read). Settings label `COMPANION_TOKEN`. Store field `companionToken`, setter `setCompanionToken`, localStorage key `musicweb.exclusive.companionToken` with no migrate (re-paste). `ExclusiveHub(companion_token=…)`. WebSocket hello field stays `token`. `PROTOCOL_VERSION` stays `1`.
- Docs update `exclusive-audio.md` in place (introduce Desktop companion as the process name). Also `commands.md`, `project-structure.md`, `technical-decisions.md`, `docs/README.md`, and `.env.example`. Do not split a new companion system doc until a second capability exists.
- Companion still `load_env_file()` then `os.environ`; it is not a `Settings` field and does not take the data-dir lock.
- `docs/plans/ARCHIVED.md` is not edited. `AGENTS.md` essentials list stays as-is. `docs/setup.md` get-started row stays “exclusive audio” and still points at `exclusive-audio.md`.

## Design

Today the sidecar is registered as `exclusive-audio` and documented as an exclusive-audio companion. Operators and the PWA treat that argv and `HOG_TOKEN` as the way to start hog playback. The process itself is already a loopback FastAPI + mpv hub with no library DB.

After this rename the same process is the Desktop companion:

```text
uv run musicweb companion
        │
        ▼
COMPANION_TOKEN (env, required)
        │
        ▼
ExclusiveHub(companion_token=…) + loopback uvicorn
        │
        ▼
ws://127.0.0.1:18765/ws   hello { token } unchanged
        │
        ▼
Mac PWA Settings → Exclusive audio
  COMPANION_TOKEN field + localStorage companionToken
```

**CLI.** Root Typer command `companion`, not a group. Flags stay `--port` and `--mpv`. Missing or empty `COMPANION_TOKEN` exits 1 before bind, with copy that names `.env` and Settings → Exclusive audio.

**Client secret.** Exclusive prefs stay under `musicweb.exclusive.*` except the token key, which becomes `musicweb.exclusive.companionToken`. Old `hogToken` storage is ignored.

**Docs that outlive this plan.** `commands.md` heading becomes Desktop companion. `exclusive-audio.md` get-started and architecture lines use `musicweb companion` / `COMPANION_TOKEN` and point the CLI source at `cli/companion.py`. `technical-decisions.md` keeps the “not Electron” decision and names Desktop companion as the sidecar.

## Stage map

1. **CLI command + process identity + hub secret** — argv, env, help/banner/title, and `ExclusiveHub` must change first so later stages document and type against a real command.
2. **Settings + client secret names** — PWA copy and persisted field must match `COMPANION_TOKEN`. Depends on stage 01’s operator contract; independent of living docs.
3. **Living docs** — write the durable names after the shipped argv and Settings strings exist. `context/design.md` is not living documentation.

## Out of scope

- New Desktop companion capabilities (menu bar, media keys, Windows/Linux, exclusive radio)
- Promoting `companion` to a Typer group
- Renaming `musicweb.exclusive`, `frontend/src/exclusive/`, Exclusive audio Settings title, or `/api/exclusive-formats`
- Changing the WebSocket hello field `token` or bumping `PROTOCOL_VERSION`
- Reading `HOG_TOKEN` or migrating `musicweb.exclusive.hogToken`
- Editing `docs/plans/ARCHIVED.md`
- Adding `COMPANION_TOKEN` to `Settings` / `config.py`
- Creating `CONTEXT.md` or a new ADR file

## Assumptions

- This is a personal project: operators will rename the env key and re-paste the token in Settings.
- `AGENTS.md` does not need `companion` in its short command list (it never listed `exclusive-audio`).
- Unknown `.env` keys remain ignored by library `Settings`; the companion CLI continues to read `COMPANION_TOKEN` itself after `load_env_file()`.
