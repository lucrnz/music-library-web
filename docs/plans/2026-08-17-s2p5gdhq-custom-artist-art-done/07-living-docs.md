# Stage 07: Living docs

## Status
done

## Description

Write the durable product rules into the normal docs tree. This plan directory is not living documentation.

## Rationale

Preferred vs scanned, menu surfaces, and “not a tag editor” will outlive the stage files. Operators and later agents should find them under `docs/systems/`, `docs/frontend/`, and `docs/product/` — not by mining `docs/plans/`.

## Invariants

- Do not copy request/response field lists, table columns, or encoder argv into docs. Point at source (`WebpAssetStore` under `covers/artists-preferred/`, `artist_images/resolve.py`, `artist_images/preferred.py`, `routes/media.py`, `artistArt/` (`applyPreferredServerResult`), `setHealthWork` in `connectivity.ts`).
- Prefer editing existing pages over adding a new top-level system doc unless a page would become unreadable.
- Commands page does not gain a new CLI; there is no `regen-preferred` job.

## Risks

- `docs/systems/library-scan.md` is easy to “fix” by saying scan writes preferred art. It must stay scan-only and mention preferred only as a store scan must not touch.

## Implementation

### Files

- Change: `docs/systems/library-scan.md` (enrichment: scan fills `covers/artists/` only; preferred portraits are a separate operator override served first)
- Change: `docs/frontend/conventions.md` (artist row menu surfaces, cropper chrome, no long-press, `artistArt/` ownership, overlay tagged union, `applyPreferredServerResult`, `rev` on any nonzero `preferred_rev`, snake_case `has_preferred_image`)
- Change: `docs/database/overview.md` (covers layout includes `artists-preferred/`; still not BLOBs)
- Change: `docs/development/environment.md` (data-dir tree line for `covers/artists-preferred/`)
- Change: `docs/systems/downloads.md` (offline thumbs follow GET; `applyPreferredServerResult` overwrites OPFS via `refreshArtistArtFile`; live blob URL on the Vue-readable `urlCache`; Downloads list/tree read that cache)
- Change: `docs/systems/connectivity.md` (multi-source `setHealthWork`; downloads remain the `"downloads"` writer via `setHealthContext`; probe if any source has work; no interval tables)
- Change: `docs/product/core-guidelines.md` (operator-preferred artist portraits are library-wide display overrides, not file-tag edits)
- Do not change: `docs/README.md` (no new page)
- Change: `AGENTS.md` — one Deep-dives line: preferred artist files are sacred to scan; see `docs/systems/library-scan.md`

### Steps

1. Library-scan: after the artist-image cascade paragraph, state that an operator override may exist beside the scanned pair; fetch/`--force` must not delete it; GET prefers it.
2. Frontend conventions: document which artist surfaces have `⋯` / right-click and which do not; cropper breakpoint chrome (`cropper.ts` + `App.vue` + `cropper.css`); router-safe history (`pushState` copies `history.state`, never changes path); client overlay in `artistArt/state.ts` (`pending` is `"upload" | "revert"`, not a boolean; queued revert keeps `hasPreferred` and the preferred thumb); HTTP success goes through `applyPreferredServerResult`; upload helpers throw `PreferredRequestError` with `.status` (via exported `apiFetch`, not `apiPost`); module graph `upload.ts` / `submit.ts` / `pending.ts` is acyclic; `artistImageUrl` appends `&rev=` on any nonzero `preferred_rev`; pending boot is `initArtistArtPending()` from `main.ts`; pending uploads live in `artistArt/` and `musicweb-artist-art`, not `downloads/`.
3. Connectivity: replace “when downloads are enabled and the queue has work” with multi-source `setHealthWork`. Downloads still write `"downloads"` through `setHealthContext`. Probe if any source has work. Flush re-arm is `reportFailure` + `requestHealthProbe`, not “wait for recovered.” No interval tables.
4. Database overview + environment: sibling directory under `covers/`, keyed by artist id.
5. Downloads: GET already returns preferred bytes; after a local upload (online submit *or* flush), `applyPreferredServerResult` overwrites the OPFS artist thumb, publishes a new object URL on `urlCache` (`artist:${id}:thumb`), then revokes the old one. List/tree read `urlCache`. `artistImageUrl` busts on nonzero `preferred_rev` even after revert. A queued revert does not change GET bytes until DELETE succeeds.
6. Product: one paragraph under Experience — custom artist art is a server-side display override, LAN-global, reversible, not written to the library tree.
7. Do not leave this plan as the source of truth. Do not add a dedicated `docs/systems/artist-art.md`.

### Verify

```sh
# read-only: grep that docs do not claim scan writes preferred files
rg -n "artists-preferred|preferred_image|Change artist photo|setHealthWork" docs AGENTS.md
```

## Acceptance

- [ ] Scan docs say force regen cannot remove preferred portraits.
- [ ] Frontend conventions name list/grid/tree menu rules and exclude search/downloads/artist page.
- [ ] Data-dir docs mention `covers/artists-preferred/`.
- [ ] Product docs say this is not a tag editor and is library-wide.
- [ ] `docs/systems/connectivity.md` describes multi-source `setHealthWork` and does not say only the download queue can start a probe.
- [ ] No duplicated API schema tables.
