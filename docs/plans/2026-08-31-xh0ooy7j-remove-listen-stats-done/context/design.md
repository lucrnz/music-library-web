**Archive.** Decisions in this file were current as of 2026-08-31 (the plan date in the directory name). They may be outdated. Do not treat this as living documentation. This plan directory is an archive.

# Remove household listen stats

## Goal

Excise household listen collection, the Stats browse mode, the listen API, and the `listen_events` table. Playback, radio, CD, and library index-count `stats` stay.

## Settled decisions

- Remove **listen stats only**. Keep `musicweb stats` and `GET /api/library/stats` (artist/album/track index counts, including the Settings scan line).
- **Full excision.** Delete the Stats UI, the 65% client cycle and localStorage outbox, `POST /api/listens` / `GET /api/listens/rankings`, the `ListenEvent` model, and the `listen_events` table. Existing listen rows are discarded.
- Drop the table with a **new** Alembic revision. Do not rewrite or delete `010_listen_events` or `013_listen_origin`.
- **No `/stats` redirect.** Delete the route. Old bookmarks fall through as any unmatched SPA path does today (no catch-all; `effectiveLibraryMode` falls back to artists while the URL stays `/stats`).
- **Strip living docs and stop.** Delete `docs/systems/playback-stats.md` and remove Stats/listen mentions from the pages that point at it. No ADR and no “we used to have this” page.
- Do not add a one-shot cleaner for `musicweb.listens.pending.v1`. Leave the orphan key; nothing will read it.
- Do not change CD, radio, exclusive, or MP3/lossy playback except by removing listen hooks. Unripped CD stubs stay (identify / later rip merge).
- Leave `docs/plans/ARCHIVED.md` as historical.

## Design

Two “stats” systems already exist and do not share tables, routes, or UI. This plan deletes only the household listen log. The inventory of delete-vs-edit paths is in [surface.md](surface.md).

Client collection and Stats UI are one product surface (`StatsView` imports `frontend/src/listens/`). They come out together so `/stats` is not a broken page and so play cycles stop counting. Playback sinks keep their time/ended handlers; only the bridge calls go.

The listen API and `listen_events` have no other readers (no pre-warm, radio picker, diagnostics, or scan consumer). After the client stops posting, the backend stage removes the routes, repository, and ORM class and adds `017_drop_listen_events` (revises `016_cd_unripped`). Startup already migrates to head.

Living docs are updated last so they describe the tree after the code is gone, not a mid-plan hybrid.

## Stage map

1. **Client excision** — stop the flaky counter and remove the ModeBar/Stats route so the product no longer offers the feature. Must precede the API drop so a still-shipping client is not left POSTing into a 404 with localStorage retry.
2. **Backend + table drop** — depends on stage 01 no longer importing the listen routes or rankings. Model and migration travel together so Alembic head matches `models.py`.
3. **Docs strip** — depends on stages 01–02 so source-of-truth links and browse-mode lists match the shipped tree. No code depends on this stage.

## Out of scope

- `musicweb stats`, `GET /api/library/stats`, and Settings index-count copy
- Fixing CD or MP3 playback
- A replacement ranking, Last.fm, pre-warm of popular encodes, or a settings wipe
- Redirecting `/stats`
- An ADR or technical-decisions entry
- Editing `docs/plans/ARCHIVED.md`
- Clearing `musicweb.listens.pending.v1` from existing browsers

## Assumptions

- Alembic head at plan time is `016_cd_unripped`. The drop revision is `017_drop_listen_events`. If another revision lands first, the new file revises whichever revision is actually head and keeps the `017_` prefix only if it is still next.
- Unmatched SPA paths remain acceptable for old `/stats` bookmarks (settled: no redirect).
- Tests must not grow a FastAPI `TestClient` / `create_app` suite to prove the listen routes are gone; pytest plus the remaining route modules are enough.
