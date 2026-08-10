# Environment and configuration

## Source of truth

- Example env template: `.env.example`
- Settings model and path resolution: `src/musicweb/config.py`
- Artist-image and lyrics **tuning constants** (intervals, retries, on/off): also `src/musicweb/config.py` — not env vars

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
| Bind address / port | Listen interface and TCP port |
| Last.fm API key | Optional; artist portraits |
| fanart.tv API key | Optional; artist portraits |
| MusicBrainz contact email | Optional but required for the MB User-Agent path used by MB + fanart MBID lookup |

Never commit `.env`. Do not log API keys or personal contact email.

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
