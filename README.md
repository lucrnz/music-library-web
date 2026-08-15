# Musicweb

> **Disclaimer:** This project has been developed heavily with AI-assisted tools. The developer does not guarantee production readiness, stability, or security. Use it at your own risk. Scope is driven solely by the developer’s interests; pull requests and feature requests are not accepted.

Musicweb is a personal LAN library player: stream your own lossless collection to phones and desktops with high-fidelity delivery. There is no authentication — anyone who can reach the port can browse and stream. Keep it on your network; do not expose it to the public internet.

- **High-fidelity streaming** from a packed-lossless library, with transparent browser-oriented encodes
- **Opt-in MP3/AAC** when that is the only copy you have (`MUSICWEB_INDEX_LOSSY`): marked on every title, streamed and downloaded as stored — never re-encoded
- **Mobile-first browse** — folders, artists, albums, and search on phone and desktop
- **Offline downloads** on the device, with separate stream and download quality preferences (including Wi‑Fi vs cellular when the browser reports connection type)
- **Installable PWA shell** when you open a secure-context origin
- **Optional exclusive playback on macOS** — hog the output device via a local companion for bit-transparent listening (Mac only for now)

## Setup

Operator on-ramp (prerequisites, configure, run, PWA notes): [docs/setup.md](./docs/setup.md).

## License

This project is licensed under the [MIT License](LICENSE).
