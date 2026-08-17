# Core product guidelines

## Source of truth

- Product and audio intent: this page
- Server encode policy implementation: `src/musicweb/transcode/`, `docs/systems/transcoding.md`
- Client playback / quality: `docs/systems/playback.md`
- Offline downloads: `docs/systems/downloads.md`
- Connectivity: `docs/systems/connectivity.md`

## Product shape

Musicweb is a **personal LAN library player**: browse and stream your own lossless-first collection from phones and desktops on the local network. It is not a multi-user service, not a public streaming platform, and not a tag editor for the on-disk library.

## Experience principles

- **Mobile-first.** Phones get bottom tabs, mini-player, and an expandable now-playing sheet. Desktop (≥ ~900px) gets side-by-side library/playlist panes and a persistent player bar.
- **Browse modes:** Folders (filesystem), Artists → Albums → Tracks, Albums grid, Search. Routes should remain bookmarkable.
- **Queue vs playlists:** Session queue lives in the browser (survives reload). Saved playlists live in SQLite and are shared across devices on the same server.
- **Honest capability:** Codec profile pickers should list only formats the **current browser can actually decode** (runtime media probes), not optimistic `canPlayType` / UA guesses alone. See `docs/systems/playback.md`.
- **Quality preferences (client):** Streaming quality can differ for Wi‑Fi vs mobile data when the browser reports `connection.type` (hidden on typical desktop). Download quality is independent. Playback may prefer a local download when it is at least as good as the active stream profile (user-selectable policy). Network cost hints never replace an explicit user setting. See `docs/systems/playback.md`.
- **Offline downloads (client):** Optional download-to-device features use browser storage (OPFS); they must not corrupt the server index. Optional “only download on Wi‑Fi” pauses the queue on cellular when connection type is detectable. See `docs/systems/downloads.md` and `docs/systems/connectivity.md`.
- **Custom artist art:** an operator can set one library-wide preferred portrait from a device file (cropped square). It is a server-side display override, LAN-global and reversible, never written back into the music library tree. Scan still fills `covers/artists/` and must not delete the override.

## Audio quality principles

**High-fidelity streaming is a primary goal.** When audio is resampled or re-encoded for the browser, prefer settings that match studio / mastering-grade practice over “good enough” consumer defaults.

Intentional policies (implementation in `transcode/`):

- **Resampling:** libsoxr via ffmpeg at SoX Very High Quality equivalents — not the OS mixer’s cheap resampler.
- **Dither:** Shibata-style dither **only when reducing bit depth**. Never dither when increasing bit depth or when depth is unchanged. If sample rate and bit depth already match the stream profile, skip aresample entirely.
- **Encoders:** best practical quality knobs for each codec (e.g. Opus VBR at the selected bitrate; true 24-bit FLAC when that profile is chosen).
- **Source library:** packed lossless is the default. MP3/AAC may be indexed when opted in; those files are marked and played as stored — do not re-encode them.

Tweaking small pipeline details for transparent delivery is preferred over simpler lower-quality paths.

## Trust and scope

- No authentication: anyone who can reach the port can browse and stream. Do not expose to the public internet.
- Scope is driven by the maintainer’s interests; the project does not accept feature requests as obligations.

## Guardrails

- Prefer transparent audio paths over convenience shortcuts that degrade quality.
- Keep the product filesystem-layout agnostic; do not require a single vendor library layout.
- Do not add other lossy formats or a lossy transcode path without a new product decision. Exclusive remux of lossy and data-saver transcode of lossy are still out of scope.
