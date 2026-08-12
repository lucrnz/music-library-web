# Stage 02: Shared runtime bootstrap

## Status
done

## Description

Extract shared process bootstrap into `musicweb.runtime` so serve and CLI construct the same core services. Support **migrate-if-no-server**: Alembic runs only when no server is currently started; a CLI process never migrates while the server is up.

## Rationale

CLI must open DB/stores without uvicorn, vendor fetch, transcoder, or startup quick-scan. Migrating from a second process against a live writer is unsafe.

## Implementation

1. `src/musicweb/runtime/bootstrap.py` (+ `runtime/__init__.py` as needed).
2. `RuntimeServices` dataclass — **required** fields (no optional job runner):
   - `settings`, `database`, `library`, `cover_store`, `artist_image_store`
   - `jobs` — the library job runner from `musicweb.jobs` (stage 03; bootstrap constructs it once phase/jobs API exists; until stage 03 lands, bootstrap may construct today’s `LibraryScanner` only if stage 02 is implemented first — prefer implementing stage 03 in the same PR as bootstrap wiring, or pass factories cleanly).
3. Move construction currently in `create_app` into bootstrap. `create_app` calls bootstrap, attaches to `app.state`, then adds FastAPI-only pieces (process cache, transcoder, routes).
4. Bootstrap **must not**: start process cache, transcoder, vendor ensure, startup quick scan, or control socket.
5. **Migrate policy**:
   - **Serve**: always migrate.
   - **CLI**: if server not started → migrate; if server up → **never** migrate.
   - **Server-up (Phase 1)**: exclusive lock held by another process (stage 01 probe). Phase 2: also treat successful control `health` as server up.
   - Read-only commands use the same policy.
6. Teardown: dispose engine when CLI leaves bootstrap scope; serve lifespan owns transcoder/cache.
7. Env/settings unchanged; no CLI path flags.
