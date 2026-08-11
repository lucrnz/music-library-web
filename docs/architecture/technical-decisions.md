# Technical decisions

Guiding choices that should outlive individual refactors.

## Source of truth

- App composition: `src/musicweb/main.py`
- Settings: `src/musicweb/config.py`
- Index models: `src/musicweb/db/models.py`
- Stream profiles: `src/musicweb/transcode/profiles.py`
- Vendor pins: `src/musicweb/vendor_deps.py`

## Decisions

### Single process, LAN-only

No multi-tenant auth, reverse-proxy requirements, or cloud object storage. The deployment model is “machine on your network running uv.” Security model is **network trust**, not application identity.

### SQLite index separate from the media tree

The music directory may be any layout and may live on slow or network storage. The app never rewrites library files for its own bookkeeping. Durable app state (DB, WebP art) lives under `MUSICWEB_DATA_DIR`.

### Content fingerprints as stable track IDs

Track primary keys are derived from content fingerprints (FLAC STREAMINFO MD5; other lossless uses a content hash). Paths can change; identity should reattach when the fingerprint matches. This enables durable playlists and covers across renames.

### Packed lossless only

Indexed formats are FLAC and ALAC-in-MP4 family containers. WAV/AIFF and AAC are out of scope for the index so the product stays focused on a high-quality source library.

### ffmpeg + libsoxr for all stream conversion

Browser-compatible delivery is produced by ffmpeg, not browser demux of arbitrary library codecs. Resampling uses libsoxr at very-high-quality settings; the server **fails startup** if required codecs/resampler are absent rather than silently degrading.

### No frontend bundler

Vue 3 and Vue Router ship as pinned browser ESM builds downloaded into `static/vendor/` on startup. Avoids Node toolchain drift for a small SPA and keeps `uv` as the only project package manager.

### Shell-only PWA with configurable public origin

The app can be installed as a standalone PWA when clients open a **secure-context** origin (`https` or loopback `http`). A **generated** service worker (`GET /sw.js` from on-disk static inventory) caches the app shell only; offline audio stays in client Downloads (OPFS). Operators set `MUSICWEB_PUBLIC_ORIGIN` (parsed as `PublicOrigin`) so manifest/install identity matches their real entry URL — not hard-coded to one deployment recipe. Details: `docs/systems/pwa.md`, `docs/development/environment.md`.

### Alembic for schema evolution

SQLAlchemy models define the intended schema; Alembic revisions under `db/migrations/versions/` evolve existing databases. Startup migrates (or stamps legacy DBs) so operators are not required to run CLI migrations for normal use.

## Guardrails

- Do not introduce a Node build step without an explicit project decision.
- Do not add public-internet auth as a soft optional — either design a real auth model or keep LAN-only explicit.
- Do not store stream cache under the durable data directory as if it were permanent.
- Do not key long-lived user data (playlists) solely on filesystem paths.
