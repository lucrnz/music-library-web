# Environment and configuration

## Source of truth

- Example env template: `.env.example`
- Settings model and path resolution: `src/musicweb/config.py`
- Artist-image and lyrics **tuning constants** (intervals, retries, on/off): also `src/musicweb/config.py` — not env vars
- PWA install model: `docs/systems/pwa.md`

## Load order

Settings use pydantic-settings. The first existing `.env` among:

1. `Path.cwd() / ".env"`
2. Project root `.env` (parent of `src/`)

is used as `env_file`. Unknown keys are ignored.

## Env variables (roles)

Documented names and defaults live in `.env.example` and `Settings` fields. Conceptually:

| Concern | Variable role |
|---------|----------------|
| Media tree root | Required in practice; absolute path preferred |
| Data directory | SQLite `library.db` + `covers/` tree (directory path, not a single file path) |
| Bind address / port | Where the process **listens** (`LISTEN` / `PORT`) — not necessarily the URL clients type |
| Public origin (PWA) | Canonical URL clients should **open** for install and day-to-day use; optional |
| Last.fm API key | Optional; artist portraits |
| fanart.tv API key | Optional; artist portraits |
| MusicBrainz contact email | Optional but required for the MB User-Agent path used by MB + fanart MBID lookup |

Never commit `.env`. Do not log API keys or personal contact email.

## Public origin vs bind address

- **`LISTEN` / `PORT`**: socket bind (e.g. `0.0.0.0:8765` so the LAN can connect).
- **`MUSICWEB_PUBLIC_ORIGIN`**: the origin you tell people (and the PWA) to use, e.g. `http://localhost:8765` behind an SSH forward, or `https://music.example.ts.net` behind TLS.

They are independent. Binding on all interfaces does not make every LAN URL installable as a PWA.

### Secure context (PWA install)

Browsers only allow service workers and reliable “Install app” in a **secure context**:

- `https://…` (any host with working TLS), or
- `http://localhost` / `http://127.0.0.1` / `http://[::1]` (optionally with a port)

**Not** a secure context for install: plain `http://192.168.x.x`, Tailscale MagicDNS over HTTP without TLS, etc. Streaming in a normal browser tab can still work there; install + offline shell will not.

When `MUSICWEB_PUBLIC_ORIGIN` is:

| Setting | Behavior |
|---------|----------|
| **Unset / empty** | Manifest uses relative `start_url` / `scope`. Client registers the service worker only if the page is already a secure context. |
| **Set to a secure-context origin** | Manifest uses absolute `start_url` / `scope` / `id` for that origin (icons stay relative). Client registers the SW **only** when `location.origin` matches (avoids splitting OPFS/cache across LAN IP vs intended origin). |
| **Set to a non-secure or unparseable value** | Startup prints a warning. Install is not expected to work; fix the URL or leave the variable empty. |

The host string must match what the browser shows **exactly**. `http://localhost:8765` and `http://127.0.0.1:8765` are different origins (separate storage and SW). Use the same form clients type in the address bar.

Examples (see `.env.example` for the exact variable name):

- `http://localhost:8765` — phone or laptop opens a local port forward to the host
- `https://library.home.example` — reverse proxy or Tailscale Serve with real TLS

Settings expose a single parsed `PublicOrigin` (`raw`, `origin`, `secure`) — see `src/musicweb/config.py`. PWA design details: `docs/systems/pwa.md`.

## Data directory layout

```text
$MUSICWEB_DATA_DIR/
  library.db
  covers/albums/
  covers/artists/
```

Stream encode cache is **not** under the data dir; it lives in a process temp directory and is wiped on shutdown.

## Guardrails

- Treat `MUSIC_LIBRARY_PATH` as read-only media; durable app state belongs under `MUSICWEB_DATA_DIR`.
- Optional API keys only unlock remote portrait providers; local `artist.jpg` / `artist.png` works without keys.
- Keep new secrets in env (or a secret store), not in source constants.
- Do not confuse bind address with public origin; PWA install requires a secure-context URL clients actually open.
