# Database overview

## Source of truth

- ORM models: `src/musicweb/db/models.py`
- Engine / startup migrate: `src/musicweb/db/engine.py`
- FTS helpers: `src/musicweb/db/fts.py`
- Repositories: `src/musicweb/db/repositories/`
- Migrations: `src/musicweb/db/migrations/`

Do not copy table columns or index definitions into docs; read the models and migrations.

## What the database is for

SQLite under `MUSICWEB_DATA_DIR/library.db` is the **searchable library index and shared playlist store**. It is not the media archive — audio files stay on the filesystem under `MUSIC_LIBRARY_PATH`.

Conceptual areas:

| Area | Represents |
|------|------------|
| Artists / albums / tracks | Normalized discovery graph and track rows with fingerprints, paths, and source audio tech |
| Track lyrics | Cached plain/synced lyrics status and text per track |
| Playlists | Named lists of track IDs shared across LAN clients |
| FTS | Full-text search over indexed track/artist/album text |
| Scan state | Single-row progress for the background scanner |

## Identity and durability

- Track IDs are stable content-derived identifiers (see scan docs).
- Missing files can be marked without immediately destroying identity (playlists and history-friendly behavior).
- Cover and artist WebP files live beside the DB under `covers/`, keyed by entity IDs — not inside SQLite BLOBs.

## Guardrails

- All schema changes go through Alembic revisions (see `docs/database/migrations.md`).
- Prefer repository helpers for queries used by routes.
- Do not point durable user data at process-temp paths.
- WAL SQLite is expected for concurrent read during scans; avoid long write transactions on the request path.
- Engine uses **NullPool** (one connection per session). Do not switch to `StaticPool` for the file DB: the scanner thread and HTTP handlers would share a connection, and one session's rollback can drop another session's uncommitted artist/album inserts (FK failures mid-scan).
