# Archived plans

Done plan directories removed from `docs/plans/` via git rm. Each entry's command shows that plan's delete commit.

## 2026-08-16-a923d3cj-unit-test-coverage-done

**Title:** Unit test coverage for meaningful components

**Commit:** `bd3ac7b21745124cbbb6ee29878c6bc5d0ab6f6a`

Shipped a hermetic pytest harness (tmp SQLite via the production migrate path) and a dual Vitest node/browser split, then filled unit tests for fingerprint, identity/reattach, job runner, transcode probe, and frontend policy/stores.

A later agent would open the delete commit to recover the coverage inventory and the never-boot / no-ffmpeg / no-coverage-gate boundaries that living docs only summarize.

```bash
git show bd3ac7b21745124cbbb6ee29878c6bc5d0ab6f6a
```
