# Music Library Web Server

Browse and stream a lossless music library over your LAN. Mobile-first web UI with folder / artist / album discovery, session queue, saved playlists, and live multi-codec transcoding via ffmpeg (libsoxr + Opus / FLAC).

> **Disclaimer:** This project has been developed heavily with AI-assisted tools. The developer does not guarantee production readiness, stability, or security. Use it at your own risk. Scope is driven solely by the developer’s interests; pull requests and feature requests are not accepted.

## Documentation

Start with [docs/README.md](./docs/README.md). Agent-specific operating rules live in [AGENTS.md](./AGENTS.md).

Quick start:

```bash
cp .env.example .env   # set MUSIC_LIBRARY_PATH
uv sync
uv run musicweb
```

## License

This project is licensed under the [MIT License](LICENSE).
