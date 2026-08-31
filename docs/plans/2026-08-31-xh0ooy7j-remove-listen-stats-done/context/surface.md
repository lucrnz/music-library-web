# Listen-stats surface (inventory)

Fact sheet for implementers. Decisions live in [design.md](design.md).

## Keep (not listen stats)

| Surface | Path |
|---|---|
| Index-count CLI | `src/musicweb/cli/stats.py`, registered in `src/musicweb/cli/app.py` |
| Index-count HTTP | `GET /api/library/stats` in `src/musicweb/routes/library_scan.py` |
| Settings scan line | `frontend/src/components/settings/LibraryScanPanel.vue` |
| Bind-address `LISTEN` | `src/musicweb/config.py` (not this feature) |
| Applied listen migrations | `src/musicweb/db/migrations/versions/010_listen_events.py`, `013_listen_origin.py` (chain; do not delete) |
| Unripped CD stubs | `tracks.unripped` / CD identify — not Stats-only |

## Delete

| Path | Role |
|---|---|
| `frontend/src/listens/` | 65% cycle, bridge, outbox, flush, chips, types |
| `frontend/src/components/stats/` | StatsView + artist/track rows |
| `frontend/tests/listens/` | accumulator / outbox / flush / rangeChips |
| `src/musicweb/routes/listens.py` | `POST /api/listens`, `GET /api/listens/rankings` |
| `src/musicweb/db/repositories/listens.py` | insert + rankings SQL |
| `tests/routes/test_listens.py` | HTTP ingest/rankings |
| `docs/systems/playback-stats.md` | living listen contract |

## Rewrite

| Path | Change |
|---|---|
| `tests/db/test_listen_events.py` | Replace the listen-events suite with one head assertion: `listen_events` is absent |

## Edit (strip hooks / Stats mode / mentions)

**Frontend:** `main.ts` (`initListens` only — keep `initAudioListeners` / `initRadioListeners` / `initCdListeners`), `api.ts` (`postListen`, `fetchListenRankings`, `mapListenArtist`, `mapListenTrack`, listen type import), `router.ts` (`/stats`), `ModeBar.vue`, `LibraryView.vue`, `browseChrome.ts`, `player.ts`, `playback/load.ts`, `radio/session.ts`, `stores/radio.ts`, `playback/cdLoad.ts`, `cd/identifyFlow.ts`, `frontend/css/library.css`.

**Frontend tests:** `frontend/tests/radio/session.test.ts`, `frontend/tests/stores/radio.test.ts`, `frontend/tests/playback/cdLoad.test.ts`, `frontend/tests/cd/identify.test.ts`.

**Backend:** `src/musicweb/routes/api.py`, `src/musicweb/db/repositories/__init__.py`, `src/musicweb/db/models.py`. **Create** `src/musicweb/db/migrations/versions/017_drop_listen_events.py`.

**Docs:** `AGENTS.md`, `docs/README.md`, `docs/architecture/index.md`, `docs/database/overview.md`, `docs/development/project-structure.md`, `docs/frontend/conventions.md`, `docs/product/core-guidelines.md`, `docs/systems/playback.md`, `docs/systems/radio.md`, `docs/systems/cd-playback.md`.

## Nothing else reads `listen_events`

Rankings SQL and `GET /api/listens/rankings` are the only readers. Transcode, radio, diagnostics JSONL, scan, downloads, and exclusive do not.
