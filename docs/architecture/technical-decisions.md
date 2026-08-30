# Technical decisions

Guiding choices that should outlive individual refactors.

## Source of truth

- App composition: `src/musicweb/main.py`
- Settings: `src/musicweb/config.py`
- Index models: `src/musicweb/db/models.py`
- Stream profiles: `src/musicweb/transcode/profiles.py`
- Frontend package pins: `frontend/package.json`

## Decisions

### Single process, LAN-only

No multi-tenant auth, reverse-proxy requirements, or cloud object storage. The deployment model is “Windows or macOS machine on your network running uv.” Security model is **network trust**, not application identity.

### SQLite index separate from the media tree

The music directory may be any layout and may live on slow or network storage. The app never rewrites library files for its own bookkeeping. Durable app state (DB, WebP art) lives under `MUSICWEB_DATA_DIR`.

### Content fingerprints as stable track IDs

Track primary keys are derived from content fingerprints (FLAC STREAMINFO MD5; other lossless uses a content hash). Paths can change; identity should reattach when the fingerprint matches. This enables durable playlists and covers across renames.

### Packed lossless default; marked MP3/AAC exception

Indexed formats are FLAC and ALAC-in-MP4 by default. MP3 and AAC-in-M4A/MP4 may be indexed when `MUSICWEB_INDEX_LOSSY` is on: they are marked on every title, streamed and downloaded as stored (`source` passthrough), and never sent through the Opus/FLAC encode pipeline. Walk eligibility classifies a file once; an unreadable MP4 is not treated as AAC. Same-folder lossless siblings win (the MP3 is skipped). Exclusive plays a local download when policy says so, otherwise streams `source` into mpv — do not invent a companion FLAC tag for lossy. WAV/AIFF, Vorbis, WMA, and Opus-as-source stay out of the index.

### ffmpeg + libsoxr for all stream conversion

Browser-compatible delivery is produced by ffmpeg, not browser demux of arbitrary library codecs. Resampling uses libsoxr at very-high-quality settings; the server **fails startup** if required codecs/resampler are absent rather than silently degrading. **ffprobe** is also required (startup and `musicweb doctor`) so radio pick-time validity checks are honest.

### Household radio reuses Transcoder / `/api/stream`

Radio is a household clock plus instructed client seek, not a live stdout pipe and not a second encoder. Tuners call the same `enqueue_prepare` as `/transcode/prepare`. There is no `/api/radio/stream` and no concat demuxer. See `docs/systems/radio.md`.

### Vite + pnpm frontend, FastAPI serves dist

The SPA is Vue 3 SFC (`<script setup lang="ts">`) plus TypeScript modules under `frontend/src/`. Vue and Vue Router versions live in `frontend/package.json`. `pnpm --dir frontend typecheck` runs `vue-tsc --noEmit` on the app tsconfig. `pnpm --dir frontend build` typechecks then Vite-emits `frontend/dist`. That build is required before `uv run musicweb` and before a green `musicweb doctor`. FastAPI serves `frontend/dist` (hashed `/assets/`, images at `/static/img/…`). CSS stays in `frontend/css/`. Client stores stay custom reactive modules (not Pinia). Client types are hand-written from today’s shapes (existing JSDoc plus unmapped snake_case fields next to their owner; no OpenAPI codegen; no new runtime mappers). The service worker stays Python-generated from a dist inventory; cache-first is precache membership. Source HTML has valid `{"publicOrigin":"","devUnlockPwa":false}`; FastAPI replaces that `#musicweb-config` script body per request (`publicOrigin` plus optional `devUnlockPwa`). Dev is `pnpm --dir frontend dev` (proxies `/api` to `:8765`) plus `uv run musicweb`.

### Exclusive audio via optional companion (not Electron)

Browser engines cannot hog the output device. Exclusive playback is an **optional** feature on the **Desktop companion** (`musicweb companion` + mpv): Core Audio exclusive on macOS, WASAPI exclusive on Windows. Not an Electron rewrite. The same sidecar holds desktop Downloads on disk. The companion does not take the library data-dir lock. See `docs/systems/exclusive-audio.md` and `docs/systems/companion.md`.

### Shell-only PWA with configurable public origin

The app can be installed as a standalone PWA when clients open a **secure-context** origin (`https` or loopback `http`). A **generated** service worker (`GET /sw.js` from `frontend/dist` inventory) caches the app shell only; offline audio is Downloads (OPFS on Android / leftover; companion disk on an installed desktop PWA). Operators set `MUSICWEB_PUBLIC_ORIGIN` (parsed as `PublicOrigin`) so manifest/install identity matches their real entry URL — not hard-coded to one deployment recipe. Details: `docs/systems/pwa.md`, `docs/development/environment.md`.

### Alembic for schema evolution

SQLAlchemy models define the intended schema; Alembic revisions under `db/migrations/versions/` evolve existing databases. Startup migrates (or stamps legacy DBs) so operators are not required to run CLI migrations for normal use.

## Guardrails

- Do not add a second bundler or generate the service worker in Node without a new decision.
- Do not add public-internet auth as a soft optional — either design a real auth model or keep LAN-only explicit.
- Do not store stream cache under the durable data directory as if it were permanent.
- Do not key long-lived user data (playlists) solely on filesystem paths.
