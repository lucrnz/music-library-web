# Core product guidelines

## Product shape

Musicweb is a **personal LAN library player**: browse and stream your own lossless collection from phones and desktops on the local network. It is not a multi-user service, not a public streaming platform, and not a tag editor for the on-disk library.

## Experience principles

- **Mobile-first.** Phones get bottom tabs, mini-player, and an expandable now-playing sheet. Desktop (≥ ~900px) gets side-by-side library/playlist panes and a persistent player bar.
- **Browse modes:** Folders (filesystem), Artists → Albums → Tracks, Albums grid, Search. Routes should remain bookmarkable.
- **Queue vs playlists:** Session queue lives in the browser (survives reload). Saved playlists live in SQLite and are shared across devices on the same server.
- **Honest capability:** Codec profile pickers should list only formats the **current browser can actually decode** (runtime media probes), not optimistic `canPlayType` / UA guesses alone.
- **Offline downloads (client):** Optional download-to-device features use browser storage (OPFS); they must not corrupt the server index.

## Audio quality principles

**High-fidelity streaming is a primary goal.** When audio is resampled or re-encoded for the browser, prefer settings that match studio / mastering-grade practice over “good enough” consumer defaults.

Intentional policies (implementation in `transcode/`):

- **Resampling:** libsoxr via ffmpeg at SoX Very High Quality equivalents — not the OS mixer’s cheap resampler.
- **Dither:** Shibata-style dither **only when reducing bit depth**. Never dither when increasing bit depth or when depth is unchanged. If sample rate and bit depth already match the stream profile, skip aresample entirely.
- **Encoders:** best practical quality knobs for each codec (e.g. Opus VBR at the selected bitrate; true 24-bit FLAC when that profile is chosen).
- **Source library:** packed lossless only; do not needlessly degrade source before the chosen stream format.

Tweaking small pipeline details for transparent delivery is preferred over simpler lower-quality paths.

## Trust and scope

- No authentication: anyone who can reach the port can browse and stream. Do not expose to the public internet.
- Scope is driven by the maintainer’s interests; the project does not accept feature requests as obligations.

## Guardrails

- Prefer transparent audio paths over convenience shortcuts that degrade quality.
- Keep the product filesystem-layout agnostic; do not require a single vendor library layout.
- Do not ship “lossy library first” workflows without revisiting product scope.
