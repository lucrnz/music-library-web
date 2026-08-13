# Stage 01: Add pytest as a uv dev dependency

## Status
done

## Description

Declare `pytest` in a uv `dependency-groups.dev` entry in `pyproject.toml`, then refresh `uv.lock` so the project can install and run pytest without polluting runtime dependencies.

## Rationale

Pytest is tooling, not a production requirement. Putting it in a dev dependency group keeps `uv sync` installs for serve/scan lean while making `uv run pytest` work once the group is synced. This stage is pure dependency plumbing so later stages can assume pytest is installable.

## Implementation

1. In `pyproject.toml`, add a `[dependency-groups]` section (or extend it if one already exists):

   ```toml
   [dependency-groups]
   dev = [
       "pytest>=8",
   ]
   ```

   Pin a reasonable lower bound (pytest 8+ is fine for Python 3.11+); prefer a version floor over an exact pin unless the project already pins tool versions tightly.

2. Refresh the lockfile so the new group is resolved:

   ```sh
   uv lock
   ```

   Or, if the preferred workflow installs the group while locking:

   ```sh
   uv sync --group dev
   ```

   Confirm `pytest` appears under the lock / environment for the `dev` group and is **not** listed under `[project].dependencies`.

3. Sanity-check without a test suite yet:

   ```sh
   uv run --group dev pytest --version
   ```

   Expect a version line and exit 0. Do not add tests or pytest config in this stage.
