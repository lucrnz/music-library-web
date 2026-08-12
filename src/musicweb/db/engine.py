"""Engine factory and database bootstrap (Alembic migrations + seed)."""

from __future__ import annotations

import logging
from pathlib import Path

from alembic import command
from alembic.config import Config
from sqlalchemy import create_engine, event, inspect, text
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import NullPool

from musicweb.db.fts import FTS_DDL
from musicweb.db.models import ScanState

logger = logging.getLogger(__name__)

_MIGRATIONS_DIR = Path(__file__).resolve().parent / "migrations"


class Database:
    """Holds the SQLAlchemy engine and session factory for the app lifetime."""

    def __init__(self, engine: Engine, session_factory: sessionmaker[Session]) -> None:
        self.engine = engine
        self.session_factory = session_factory

    def session(self) -> Session:
        return self.session_factory()


def make_engine(data_dir: Path) -> Engine:
    """Create a SQLite engine under ``data_dir / library.db`` with WAL pragmas.

    Uses NullPool (not StaticPool): the scanner runs on a background thread while
    HTTP handlers open their own sessions. A single shared connection lets one
    session's commit/rollback poison another session's uncommitted graph inserts
    (artist flush succeeds, album insert then fails FK).
    """
    data_dir.mkdir(parents=True, exist_ok=True)
    (data_dir / "covers" / "albums").mkdir(parents=True, exist_ok=True)
    (data_dir / "covers" / "artists").mkdir(parents=True, exist_ok=True)
    db_path = (data_dir / "library.db").resolve()
    url = f"sqlite:///{db_path}"
    engine = create_engine(
        url,
        echo=False,
        connect_args={"check_same_thread": False},
        poolclass=NullPool,
    )

    @event.listens_for(engine, "connect")
    def _set_sqlite_pragma(dbapi_conn, _connection_record) -> None:  # type: ignore[no-untyped-def]
        cursor = dbapi_conn.cursor()
        cursor.execute("PRAGMA journal_mode=WAL")
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.execute("PRAGMA busy_timeout=5000")
        cursor.close()

    return engine


def _alembic_config(engine: Engine) -> Config:
    cfg = Config()
    cfg.set_main_option("script_location", str(_MIGRATIONS_DIR))
    cfg.set_main_option("sqlalchemy.url", engine.url.render_as_string(hide_password=False))
    return cfg


def run_migrations(engine: Engine) -> None:
    """
    Apply Alembic migrations to head.

    If the DB was created earlier with create_all (no alembic_version) but
    already has our tables, stamp head instead of re-running DDL.
    """
    cfg = _alembic_config(engine)
    insp = inspect(engine)
    tables = set(insp.get_table_names())
    has_version = "alembic_version" in tables
    has_app_tables = "tracks" in tables and "artists" in tables

    with engine.connect() as connection:
        cfg.attributes["connection"] = connection
        if has_app_tables and not has_version:
            logger.info("Existing schema without Alembic — stamping head")
            command.stamp(cfg, "head")
            # Ensure FTS exists even if an older create_all DB lacked it
            connection.execute(text(FTS_DDL))
            connection.commit()
        else:
            command.upgrade(cfg, "head")
            connection.commit()


def init_database(data_dir: Path) -> Database:
    """Create engine, run migrations, and ensure scan_state row exists."""
    engine = make_engine(data_dir)
    run_migrations(engine)

    session_factory = sessionmaker(bind=engine, autoflush=False, autocommit=False)
    db = Database(engine, session_factory)

    with db.session() as session:
        row = session.get(ScanState, 1)
        if row is None:
            session.add(
                ScanState(
                    id=1,
                    status="idle",
                    mode=None,
                    files_seen=0,
                    files_upserted=0,
                    files_missing=0,
                )
            )
            session.commit()
        else:
            if row.status in ("running", "canceling"):
                row.status = "idle"
                row.phase = None
                row.current_path = None
                row.last_error = row.last_error or "Interrupted by restart"
                session.commit()

    logger.info("Database ready at %s", data_dir / "library.db")
    return db
