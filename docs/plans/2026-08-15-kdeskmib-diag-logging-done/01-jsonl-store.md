# Stage 01: JSONL store and rotation

## Status
done

## Description

Add a durable diag directory and a Python writer that appends one JSON object per line to `events-YYYY-MM-DD.jsonl` (UTC date) and deletes oldest day files when the directory exceeds `DIAG_DIR_MAX_BYTES`.

## Rationale

Every later stage needs a single append path. Rotation has to exist before Everything-mode ingest or the first forgotten weekend fills the disk.

## Invariants

- Files live only under `$MUSICWEB_DATA_DIR/diag/`. Not process-temp. Not `library.db`.
- One file per UTC calendar day, name `events-YYYY-MM-DD.jsonl`.
- Current day’s file is never deleted while it is the only `events-*.jsonl`.
- Writer is safe to call from the HTTP thread: append + fsync-optional; rotation is best-effort and must not raise into callers on a single unreadable sibling file.

## Risks

- A single huge today-file can overshoot the cap. Accepted (transition-only volume; CLI purge exists).
- Concurrent append from multiple request threads: open-append-close per write (or a small lock). Do not hold the library DB session.

## Implementation

### Files

- Create `src/musicweb/diag/__init__.py`
- Create `src/musicweb/diag/store.py`
- Change `src/musicweb/config.py` (`DIAG_DIR_MAX_BYTES`, `diag_dir()` on Settings or a helper)
- Change `src/musicweb/config.py` `ensure_data_dir` to mkdir `diag/`
- Create `tests/test_diag_store.py`

### Steps

1. Add `DIAG_DIR_MAX_BYTES = 64 * 1024 * 1024` as a **source constant** in `config.py` (same style as lyrics/artist-image tuning — not an env var).
2. `Settings.diag_dir` → `self.musicweb_data_dir / "diag"`. `ensure_data_dir` creates it.
3. `store.append(dir, record: dict) -> Path`: serialize one object (`ensure_ascii=False`, no `NaN`), write `json + "\n"` to `events-{utc_date}.jsonl`, then `maybe_rotate(dir)`.
4. `maybe_rotate`: sum sizes of `events-*.jsonl` only; while total > cap and there are ≥2 files, unlink the oldest by filename (ISO date sorts). Ignore non-matching files.
5. Reject non-dict records in `append` with `TypeError` (tests + later ingest depend on this). Do not invent an event catalog here.

### Verify

- `uv run --group dev pytest tests/test_diag_store.py`
- `rg "library.db|alembic" src/musicweb/diag` — no matches
- `rg "DIAG_DIR_MAX_BYTES" src/musicweb/config.py`

## Acceptance

- [x] `ensure_data_dir()` creates `diag/`.
- [x] Two writes on the same UTC day append two lines to one file; a mocked next-day write opens a new file.
- [x] When older day files plus today exceed the cap, the oldest files disappear and today remains if it is the last file.
- [x] No migration, no new env var.
