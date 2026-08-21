# Stage 04: Living docs for forget vs idle wipe

## Status
done

## Description

Update living system docs (and the worker module docstring if stage 02 left a stale `/api/cache/clear` mention) so cache lifecycle matches shipped behavior: idle + shutdown full wipe, id-scoped forget on queue clear / last-row remove, radio current+remaining retained.

## Rationale

`docs/systems/transcoding.md` still says idle wipe is “the same path as `POST /api/cache/clear`”. After stages 01–03 that sentence is false. Docs follow the code.

## Invariants

- Do not treat `context/design.md` as living documentation.
- Do not add an ADR.
- Do not document upcoming radio ids or a retain-set endpoint.
- `AGENTS.md` idle+shutdown sentence stays true; only add forget if a one-line hard-rule update is needed to stop operators looking for a clear POST.

## Risks

- Editing archived plan text in `docs/plans/ARCHIVED.md` or done plan dirs. Leave those alone.

## Implementation

### Files

- `docs/systems/transcoding.md`
- `docs/systems/playback.md`
- `docs/systems/radio.md`
- `src/musicweb/transcode/worker.py` (module docstring, if still naming `/api/cache/clear`)
- `Agents.md` (only if the cache hard-rule still implies a manual HTTP wipe)

### Steps

1. Transcoding cache paragraph: full wipe is shutdown + ~1h idle `Transcoder.clear_cache()` only. No `POST /api/cache/clear`. Queue edits may `POST /api/transcode/forget` for discarded ids; radio current+remaining are not forgotten. Point at source for body/counts.
2. Playback prepare section: mention forget on clear-queue and last-row remove, last-occurrence rule, fire-and-forget, `preparedKeys` drop. Saved-playlist load does not forget.
3. Radio delivery / guardrails: forget must not evict current + remaining (simulation included). Still do not `clear_cache` on 1→0 tuners. Still do not serialize upcoming ids.
4. Worker module docstring: wipe paths are shutdown and idle eviction, not a scoped HTTP clear.
5. Do not rewrite architecture/product pages unless they still name `/api/cache/clear` (grep; today they do not).

### Verify

- Grep `docs/` and `src/` (exclude `docs/plans/`) for `/api/cache/clear` and `clearCache` — no living hits
- Grep living docs for `/api/transcode/forget` — transcoding + playback (and radio retain rule) mention it

## Acceptance

- Living docs describe idle+shutdown as the only full wipes and forget as id-scoped with the radio retain exception.
- No living doc tells an operator or the SPA to POST `/api/cache/clear`.
