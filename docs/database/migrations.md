# Schema migrations

## Source of truth

- Alembic env and versions: `src/musicweb/db/migrations/`
- Optional CLI config: `alembic.ini` (default URL `sqlite:///./data/library.db`)
- Runtime apply: `src/musicweb/db/engine.py` (`init_database`)

## Behavior

On startup the app opens the SQLite file under the configured data directory and brings the schema to Alembic **head**. Older databases created before Alembic may be **stamped** at head when detected as pre-migration layouts — operators should still treat backups as wise before major upgrades.

Manual CLI (from project root, when using the default data path):

```sh
alembic upgrade head
```

## Adding a migration

1. Change models in `db/models.py` (and any repository assumptions).
2. Add a new revision under `db/migrations/versions/` following the existing numbering/style.
3. Ensure upgrade (and downgrade if you maintain one) is safe for existing libraries.
4. Run the app or `alembic upgrade head` against a copy of real data before relying on it.

## Guardrails

- Never rewrite or delete already-applied revision files that may exist in the wild.
- Do not rely on `CREATE TABLE IF NOT EXISTS` ad-hoc at runtime as a substitute for migrations.
- Keep `alembic.ini` `script_location` aligned with the package path.
- Remember CLI `sqlalchemy.url` may differ from a user’s `MUSICWEB_DATA_DIR`; prefer testing via the running app for path fidelity.
