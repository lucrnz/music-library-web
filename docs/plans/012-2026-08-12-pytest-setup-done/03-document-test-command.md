# Stage 03: Document how to run tests

## Status
done

## Description

Document the install-with-dev-group and pytest invocation in `docs/development/commands.md`, and mention the new top-level `tests/` directory in `docs/development/project-structure.md` so onboarding matches the live layout.

## Rationale

Project documentation strategy treats install/run/test commands as essential onboarding surface. Without a documented `uv run pytest` path, the dependency and smoke test exist only for people who already know the layout. Structure docs should note `tests/` so ownership of automated checks is discoverable next to `src/musicweb/`.

## Implementation

1. In `docs/development/commands.md`:

   - After the Install section (or in a nearby **Test** section), document:

     ```sh
     uv sync --group dev
     uv run --group dev pytest
     ```

   - Note that pytest lives in the `dev` dependency group (not runtime deps).
   - Keep the page as a convenience copy: point at `pyproject.toml` for the exact group name and tool config if something drifts.
   - Do not invent CI, coverage, or marker matrices in this stage.

2. In `docs/development/project-structure.md` Root section, add a bullet for:

   - `tests/`: automated tests (pytest); smoke coverage starts with package importability.

3. Optionally cross-check `docs/README.md` / documentation map only if it lists development pages and would be incomplete without a testing mention—prefer no drive-by rewrites of the map.

4. Verify docs against reality: the commands in the doc should match the flags that actually pass after stages 01–02 (especially whether default `uv sync` includes the `dev` group on this uv version; if default sync omits it, document `--group dev` explicitly).
