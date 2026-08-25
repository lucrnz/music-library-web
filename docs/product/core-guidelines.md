# Core product guidelines

## Source of truth

- Product and audio intent: this page
- Server encode policy implementation: `src/musicweb/transcode/`, `docs/systems/transcoding.md`
- Client playback / quality: `docs/systems/playback.md`
- Offline downloads: `docs/systems/downloads.md`
- Desktop companion: `docs/systems/companion.md`
- Connectivity: `docs/systems/connectivity.md`

## Product shape

Musicweb is a **personal LAN library player**: browse and stream your own lossless-first collection from phones and desktops on the local network. It is not a multi-user service, not a public streaming platform, and not a tag editor for the on-disk library.

## Platform support

Clients are **installed Chromium PWAs** unless noted. Feature availability (for example exclusive hog) can be narrower than the tier.

| Tier | Who | What we do |
|------|-----|------------|
| **First-party** | Windows, macOS, Android — any Chromium PWA (Chrome, Brave, Edge, unbranded Chromium) | The focus. Current developer testing is Chromium/Brave. |
| **Second-party** | Linux Chromium PWA | Implement the same desktop features (do not skip Linux). Testing is best-effort when someone has a Linux box. Do not block a change on Linux testing if you are not on Linux. |
| **Out of scope** | iOS, Safari, Firefox, and everything else | Best-effort if the engine happens to work. Agents do not implement, test, or prioritize those clients. |

## Experience principles

- **Mobile-first.** Phones get bottom tabs (Library | Playlist | Radio), scrolling browse-mode chips, icon-only queue actions, a mini-player, and an expandable now-playing sheet. Desktop (≥ ~900px) hides the tab bar; Library/Playlist stay the dual-pane; radio uses the now-playing right rail. Chrome is an application shell, not a document: names and lyrics are copied from `⋯` menus, not by selecting page text.

- **Browse modes:** Artists → Albums → Tracks, Albums grid, Search, Stats. Routes should remain bookmarkable. Stats is household most-played, not a Settings surface — see `docs/systems/playback-stats.md`.
- **Queue vs playlists:** Session queue lives in the browser (survives reload). Saved playlists live in SQLite and are shared across devices on the same server.
- **Honest capability:** Codec profile pickers should list only formats the **current browser can actually decode** (runtime media probes), not optimistic `canPlayType` / UA guesses alone. See `docs/systems/playback.md`.
- **Quality preferences (client):** One Streaming setting and an independent Download setting. Playback may prefer a local download when it is at least as good as the active stream profile (user-selectable policy). See `docs/systems/playback.md`.
- **Offline downloads (client):** Optional download-to-device locker. Android (and leftover browser files) use OPFS. An installed desktop PWA stores bytes on companion disk. They must not corrupt the server index. The download queue auto-pauses when offline, the server is unreachable, or the companion is down. See `docs/systems/downloads.md`, `docs/systems/companion.md`, and `docs/systems/connectivity.md`.
- **Custom artist art:** an operator can set one library-wide preferred portrait from a device file (cropped square). It is a server-side display override, LAN-global and reversible, never written back into the music library tree. Scan still fills `covers/artists/` and must not delete the override.

## Audio quality principles

**High-fidelity streaming is a primary goal.** When audio is resampled or re-encoded for the browser, prefer settings that match studio / mastering-grade practice over “good enough” consumer defaults.

Intentional policies (implementation in `transcode/`):

- **Resampling:** libsoxr via ffmpeg at SoX Very High Quality equivalents — not the OS mixer’s cheap resampler.
- **Dither:** Shibata-style dither **only when reducing bit depth**. Never dither when increasing bit depth or when depth is unchanged. If sample rate and bit depth already match the stream profile, skip aresample entirely.
- **Encoders:** best practical quality knobs for each codec (e.g. Opus VBR at the selected bitrate; true 24-bit FLAC when that profile is chosen). Lower Opus targets (96 and 64 kbps) are allowed marketing options for size and bandwidth on that same libopus path. They do not relax soxr/dither policy.
- **Source library:** packed lossless is the default. MP3/AAC may be indexed when opted in; those files are marked and played as stored (on-demand **and** radio) — do not re-encode them.
- **Radio tab:** one household station; Tune in joins the official clock via `/api/stream` + seek. Exclusive-mode radio is TODO (Tune-in stops the hog; radio stays HTML-only). See `docs/systems/radio.md`.

Tweaking small pipeline details for transparent delivery is preferred over simpler lower-quality paths.

## Trust and scope

- No authentication: anyone who can reach the port can browse and stream. Do not expose to the public internet.
- Scope is driven by the maintainer’s interests; the project does not accept feature requests as obligations.

## Guardrails

- Prefer transparent audio paths over convenience shortcuts that degrade quality.
- Keep the product filesystem-layout agnostic; do not require a single vendor library layout.
- Do not add other lossy formats or a lossy transcode path without a new product decision. Exclusive remux of lossy and data-saver transcode of lossy are still out of scope. Opus 64/96 kbps is not a new format and does not authorize transcoding indexed MP3/AAC.
