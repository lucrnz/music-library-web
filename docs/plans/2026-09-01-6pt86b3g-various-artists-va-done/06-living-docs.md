# Stage 06: Write VA into living docs

## Status
done

## Description

Move the durable VA decisions out of this plan directory into the project’s normal docs: scan remount, discovery rules, radio performer graph, portrait exception, and the term **VA**.

## Rationale

`context/design.md` is not living documentation. Operators and later agents will look at `docs/systems/` and `docs/product/`. This stage exists so the closed alias policy, the 404 rule, and the radio ban key survive `git rm` of the plan.

## Invariants

- Docs say **VA** for the concept and **Various Artists** for the display name.
- Exact alias strings, payload keys, and encoder/SQL stay in source (`src/musicweb/db/va.py` and routes). Docs state intent and point at those files.
- No new standalone VA page; update the existing map.

## Risks

- Describing the alias list in two places (docs vs `va.py`) will drift — keep the inventory in source and only summarize the fold + “closed set” here.

## Implementation

### Files

- `docs/systems/library-scan.md`
- `docs/systems/radio.md`
- `docs/frontend/conventions.md`
- `docs/product/core-guidelines.md`
- `docs/database/overview.md`
- `docs/architecture/technical-decisions.md`
- `docs/README.md`

### Steps

1. In `docs/systems/library-scan.md`, add a VA subsection: detection is whole-field album artist via `musicweb.db.va`; one canonical artist; any `run_scan` remounts without re-reading files; regen jobs do not remount; preferred portraits stay sacred; artist-image phase skips VA. Point at `src/musicweb/db/va.py`, `src/musicweb/scan/va_remount.py`, `src/musicweb/scan/identity.py`.
2. In `docs/systems/radio.md` Picking, replace “uniform random album artist → album → track” and the 2-per-album-artist cap with: uniform performing artist → album → track; VA albums contribute per-performer subalbums; banlist stays track ids and also excludes those tracks’ performing artists except VA; loosening is drop ban batches then short batch. Point at `src/musicweb/radio/picker.py`.
3. In `docs/frontend/conventions.md`, note: Artists list is album owners; album-less artist routes are not found; Go to artist requires `artistBrowsable`; VA has no photo menu; cover-flip on VA uses the packaged Aero note (`isVa`).
4. In `docs/product/core-guidelines.md` custom artist art bullet, add the VA exception (packaged note, no preferred). Mention browse: VA is one artist; VA-only performers are not.
5. In `docs/database/overview.md` identity section, state that VA aliases collapse to one well-known artist id (uuid5 of normalized `Various Artists`); album ids follow that owner; no `is_va` column.
6. In `docs/architecture/technical-decisions.md`, add a short decision: compilations whose album artist matches the VA alias set are one artist; radio identity is the performing artist.
7. In `docs/README.md`, do not add a new page; the existing scan / radio / frontend / product links are enough.

### Verify

- `rg -n "album artist → album → track|RADIO_MAX_PER_ARTIST|2 tracks per album artist" docs/systems/radio.md` no longer describes the old picker as current.
- `rg -n "\\bVA\\b|Various Artists" docs/systems/library-scan.md docs/systems/radio.md docs/frontend/conventions.md docs/product/core-guidelines.md` hits the new prose.

## Acceptance

- A reader of `docs/systems/library-scan.md` and `docs/systems/radio.md` can explain VA remount, VA-only performers, and the performing-artist ban without opening this plan directory.
- Alias inventory is not duplicated as a second closed list in docs.
- This plan directory is still not treated as living design.
