"""Alembic environment — runs online against the app engine connection."""

from __future__ import annotations

from logging.config import fileConfig

from alembic import context
from sqlalchemy import Engine

from musicweb.db.base import Base
from musicweb.db import models  # noqa: F401 — register models on Base.metadata

config = context.config
if config.config_file_name is not None:
    try:
        fileConfig(config.config_file_name)
    except Exception:
        pass

target_metadata = Base.metadata


def run_migrations_offline() -> None:
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        render_as_batch=True,
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    connectable: Engine | None = config.attributes.get("connection")
    if connectable is not None and hasattr(connectable, "execute"):
        # Connection passed from init_database
        connection = connectable
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            render_as_batch=True,
            include_object=_include_object,
        )
        with context.begin_transaction():
            context.run_migrations()
        return

    from sqlalchemy import engine_from_config, pool

    engine = engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )
    with engine.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            render_as_batch=True,
            include_object=_include_object,
        )
        with context.begin_transaction():
            context.run_migrations()


def _include_object(object, name, type_, reflected, compare_to) -> bool:
    # FTS virtual tables are managed by hand in migrations / fts.py
    if type_ == "table" and name and name.endswith("_fts"):
        return False
    if type_ == "table" and name and name.startswith("tracks_fts"):
        return False
    return True


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
