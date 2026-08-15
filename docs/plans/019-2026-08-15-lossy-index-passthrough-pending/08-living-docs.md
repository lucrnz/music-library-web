# Stage 08: Living docs and README

## Status
pending

## Description

Rewrite the lossless-only product claim to lossless-first with a marked, opt-in lossy exception. Update README, AGENTS.md, setup, environment, technical decisions, product guidelines, and the scan / transcode / playback / downloads / exclusive / PWA surfaces so they match stages 01–07.

## Rationale

`docs/plans/` is not living documentation. The hard rule in AGENTS.md still forbids lossy indexing. If this stage is skipped, the next agent will treat the shipped behavior as a violation.

## Invariants

- Stance stays lossless-first. Do not rewrite the product as a generic mixed library.
- Source of truth for exact flags, columns, and tags remains code. Docs state intent and point at files.
- Exclusive remux of lossy and data-saver transcode of lossy stay documented as out of scope. Exclusive + lossy is refused.
- This plan directory is not linked as if it were current design.

## Risks

- Editing only README leaves AGENTS.md telling agents not to add lossy paths.
- Copying column names and the `source` tag into five pages will drift. Name the files; do not paste schemas.
- PWA manifest description and CLI `--help` still say “lossless library” if this stage only touches `docs/`.

## Implementation

### Files

- Change `README.md`
- Change `AGENTS.md`
- Change `docs/setup.md`
- Change `docs/development/environment.md`
- Change `docs/development/project-structure.md`
- Change `docs/development/commands.md` only if a command help line is quoted there
- Change `docs/product/core-guidelines.md`
- Change `docs/architecture/technical-decisions.md`
- Change `docs/systems/library-scan.md`
- Change `docs/systems/transcoding.md`
- Change `docs/systems/playback.md`
- Change `docs/systems/downloads.md`
- Change `docs/systems/exclusive-audio.md` (lossy refuse; remux still future)
- Change `docs/frontend/conventions.md` if stage 07 did not already add the mark/toast rule
- Change `src/musicweb/cli/app.py` Typer help
- Change `src/musicweb/__init__.py` package docstring
- Change `src/musicweb/routes/pwa.py` manifest `description`
- Do **not** change files under `docs/plans/` except this stage’s status when executing

### Steps

1. **README:** keep the LAN / no-auth disclaimer. Lead with high-fidelity streaming from a packed-lossless library. Add a bullet that MP3/AAC may be indexed when `MUSICWEB_INDEX_LOSSY` is on, are marked, and play as stored. Do not lead with lossy.
2. **AGENTS.md:** replace “Do not add lossy indexing paths without an explicit product decision” with the new hard rule: packed lossless is the default; MP3/AAC are opt-in, marked, passthrough-only; do not add other lossy formats or a lossy transcode path without a new product decision.
3. **technical-decisions.md:** replace “Packed lossless only” with “Packed lossless default; marked MP3/AAC exception” — flag, sibling skip, `source` passthrough, exclusive refuse.
4. **core-guidelines.md:** drop “do not ship lossy library first”; state the exception and the no-re-encode rule.
5. **library-scan.md:** walk is indexable (flag-aware); sibling skip; album `lossy_kind` roll-up. Still no column dump.
6. **transcoding.md:** encode pipeline is lossless-only. Lossy is not a profile. Point at `passthrough.py` / media route.
7. **playback.md:** `source` delivery, status face, probes, exclusive_lossy, prepare skip.
8. **downloads.md:** original file for lossy; prefs apply to lossless.
9. **exclusive-audio.md:** companion still lossless FLAC tags; lossy tracks are unavailable until a future remux plan.
10. **setup.md** + **environment.md:** library may contain MP3/AAC; they are ignored unless `MUSICWEB_INDEX_LOSSY` is true. Add the variable to the env roles table.
11. CLI help, package docstring, PWA description: “lossless-first library” (or equivalent), not “lossless only” and not “any music files.”
12. `docs/README.md` map: no new page unless an existing systems page cannot absorb the exception. Prefer editing the pages above.

### Verify

- Grep the repo (except `docs/plans/` and this stage) for leftover “packed lossless only” / “do not add lossy” claims that contradict the new rule. Remaining mentions must be historical or clearly about the default-off flag.
- Read README + AGENTS.md + `core-guidelines.md` + `technical-decisions.md` as a new operator/agent: the flag, the mark, and “no re-encode” are findable without opening this plan directory.
- `uv run musicweb --help` help text matches the new stance.

## Acceptance

- [ ] README and AGENTS.md describe lossless-first + opt-in marked passthrough. The old “never index lossy” hard rule is gone.
- [ ] Architecture, product, setup, env, scan, transcode, playback, downloads, and exclusive pages agree with stages 01–07.
- [ ] CLI help and PWA description do not still say lossless-only.
- [ ] No schema/profile/tag dump that duplicates source. No link treating this plan as living design.
