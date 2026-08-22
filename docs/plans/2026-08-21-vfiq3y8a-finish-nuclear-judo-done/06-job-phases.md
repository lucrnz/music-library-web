# Stage 06: Job phases

## Status
done

## Description

One `PHASES` table and `_run_phases` loop in `jobs/runner.py`. One `iter_enrichment` for the lyrics and artist-image commit loops. Control client keeps today’s RPC methods. Delete `getattr` on `ScanState`.

## Rationale

Scan vs three regen methods are the same cancel/progress/phase sandwich. The next job kind will add a fifth copy. This is the backend path-to-god delete the last plans parked.

## Invariants

- Job kinds stay `scan` | `regen-covers` | `regen-artist-images` | `regen-lyrics`.
- One `_begin` writes the running row. `last_scan_finished_at` is still set only when a scan reaches idle.
- `_progress` stays log-only.
- Control UDS method names (`start_scan`, `start_regen_*`) do not change.
- No `jobs/kinds.py`. `ScanMode` stays in `scan/batch.py`.
- Lyrics candidate SQL (the three passes) stays in `scan/lyrics.py`. Artist `needs_fetch` stays on the fetcher.

## Risks

- Regen force vs scan `mode == "full"` must still map the same way `_begin` does today.
- Enrichment commit-every-10 and greppable log lines are operator-visible.

## Implementation

### Files

- `src/musicweb/jobs/runner.py`
- `src/musicweb/jobs/__init__.py`
- `src/musicweb/scan/enrichment.py`
- `src/musicweb/scan/lyrics.py`
- `src/musicweb/scan/artist_images.py`
- `src/musicweb/lyrics/fetch.py`
- `tests/jobs/test_runner.py`
- `tests/artist_images/test_preferred_scan_isolation.py`

### Steps

1. In `src/musicweb/jobs/runner.py`, define `PHASES` keyed by `JobKind`: `scan` = index → finalize → covers → artist_images → lyrics; each regen kind = its one phase. One `_run_phases` loop owns `_set_state(phase)`, `_progress`, `cancel` check, and the phase callable. Delete `_run_scan` and the three `_run_regen_*` methods. `_execute` calls `_run_phases`.
2. Type `status()` against `ScanState` columns. Delete `getattr(row, "kind"/"force", None)`.
3. Add `src/musicweb/scan/enrichment.py` `iter_enrichment(database, ids, *, load, needs, fetch, log_prefix, cancel, commit_every=10)` with today’s collect → reopen session → needs → fetch → commit every N → greppable `Library scan: {prefix}` counters. `scan/artist_images.py` and the fetch loop in `scan/lyrics.py` call it. Lyrics keeps `_pass1_*` / `_pass1b_*` / `_pass2_*` queries.
4. One sidecar helper: keep `.lrc` `is_file()` next to the audio in `lyrics/fetch.py` only. `scan/lyrics.py` calls that helper (or `present_audio` + the helper). Delete the duplicate `abs_path.with_suffix(".lrc").is_file()` block in the scan phase.
5. `src/musicweb/jobs/__init__.py` still exports `LibraryJobRunner`, `JobKind`, `ScanMode`. Do not add a kinds module.
6. `tests/jobs/test_runner.py` still covers scan + each regen kind, cancel, and `last_scan_finished_at` only on scan idle. Add or adjust one case so a regen kind does not blank that watermark (already the rule; keep it green). Isolation test still constructs the runner with `WebpAssetStore` / `CoverStore`.

### Verify

- `uv run pytest tests/jobs/test_runner.py tests/scan/test_finalize.py tests/scan/test_batch.py tests/artist_images/test_preferred_scan_isolation.py tests/artist_images/test_preferred.py`
- `rg -n "def _run_scan|def _run_regen_|getattr\\(row, \\\"kind\\\"" src/musicweb/jobs/runner.py` is empty
- `rg -n "jobs/kinds" src` is empty
- `rg -n "with_suffix\\(\\\"\\.lrc\\\"\\)" src/musicweb` has one owner (`lyrics/fetch.py` or the shared helper it exports)

## Acceptance

- One phase loop. No `_run_scan` / `_run_regen_*`.
- Scan still runs index → finalize → covers → portraits → lyrics. Each regen kind still runs only its phase.
- Enrichment commit cadence and log prefixes match today.
- One sidecar `.lrc` check.
- Control RPC names unchanged. `last_scan_finished_at` still scan-only.
- `ScanState.kind` / `force` are typed attributes, not `getattr`.
