# Stage 04: Living docs

## Status
done

## Description

Record that the process-temp stream cache is also emptied after about an hour with no HTTP client, using the same `clear_cache` path as shutdown’s cousin `POST /api/cache/clear`. Point SoT at `transcode/idle.py`. Do not copy the 3600/60 numbers into docs as a product contract.

## Rationale

Several pages still say the cache lives until process exit. After stage 03 that is incomplete and will mislead the next cache change.

## Invariants

- Intervals stay in `idle.py`. Docs say “about an hour” / “source constants,” not `3600`.
- This plan directory is not cited as living SoT.
- No new systems page. Idle wipe is cache lifetime on the transcoding page.

## Risks

None

## Implementation

### Files

- Change `docs/systems/transcoding.md` (SoT list + Cache and concurrency)
- Change `AGENTS.md` (essentials one-liner)
- Change `docs/development/environment.md` (data-dir vs stream cache sentence)
- Change `docs/architecture/index.md` (streams/ caption)
- Change `docs/development/project-structure.md` (`transcode/` row)
- Change `docs/development/commands.md` (Ctrl+C / stream-cache sentence)
- Change `src/musicweb/cache.py` (module / class docstring — still wiped on shutdown, also idle)

### Steps

1. **transcoding.md:** add `src/musicweb/transcode/idle.py` to Source of truth. In Cache and concurrency: shutdown still deletes the tree; additionally, after about an hour with no in-flight HTTP and no recent request, the server runs `Transcoder.clear_cache()`. Any HTTP counts; control socket and exclusive companion WS do not. Do not persist as user data (existing guardrail stays).
2. **AGENTS.md:** extend the process-temp bullet: wiped on shutdown **and** after about an hour with no HTTP client.
3. **environment.md**, **architecture/index.md**, and **commands.md:** one clause each so they do not still say “deleted on exit” / “deleted on Ctrl+C” only. `commands.md` today: “Process-temp stream caches are deleted on exit.”
4. **project-structure.md:** `transcode/` owns idle eviction policy as well as encode worker.
5. **cache.py:** docstring mentions idle wipe of `streams/` contents (root still torn down only on `ProcessCache.shutdown`).
6. Do not add an env row. Do not link `docs/plans/030-…`.

### Verify

- `rg -n "idle|about an hour|transcode/idle" docs/systems/transcoding.md AGENTS.md docs/development/environment.md docs/development/commands.md docs/architecture/index.md docs/development/project-structure.md src/musicweb/cache.py`
- `rg "deleted on exit" docs/development/commands.md` — that phrase is no longer the whole story (idle wipe mentioned in the same sentence or the next).
- `rg "docs/plans/030" docs AGENTS.md` — no matches
- `rg "3600|POLL_INTERVAL" docs/systems/transcoding.md AGENTS.md docs/development docs/architecture` — no matches (numbers stay in source)

## Acceptance

- [x] transcoding.md names `idle.py` and describes last-HTTP + in-flight + reuse of `clear_cache`.
- [x] AGENTS.md / environment.md / architecture diagram caption / commands.md no longer imply shutdown is the only wipe.
- [x] No env documentation, no plan-directory SoT links, no copied interval numbers.
