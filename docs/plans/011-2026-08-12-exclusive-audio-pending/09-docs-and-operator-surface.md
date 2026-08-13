# Stage 09: Docs and operator surface

## Status
pending

## Description

Document exclusive audio end-to-end: CLI, `HOG_TOKEN`, port 18765, mpv, Mac installed PWA, `GET /api/exclusive-formats`, profile-tag stream/prepare, sinks, prepare rules, hard-fail, out-of-scope.

## Rationale

Self-hosted open source needs an obvious operator path; PWA∩mac and env token look like bugs without docs.

## Implementation

- `docs/development/commands.md`: `HOG_TOKEN=… uv run musicweb exclusive-audio` — default port 18765, loopback, mpv required, no data-dir lock, not the library server.
- `docs/systems/exclusive-audio.md`: architecture diagram in prose; tag grammar + full matrix; exclusive-formats; format modes; arming; lock/heartbeat; digital-then-hardware volume; absolute URLs to remote server; PWA/`MUSICWEB_PUBLIC_ORIGIN`; out-of-scope (gapless, media keys, Windows companion, Electron, bit-perfect files).
- Cross-links: docs map, playback, frontend conventions, technical-decisions (optional companion; browser never hogs; no Node bundler for this).
- Verify env/flags/port against implementation.
