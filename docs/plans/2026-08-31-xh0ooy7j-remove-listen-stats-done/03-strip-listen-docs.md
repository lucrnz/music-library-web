# Stage 03: Strip listen-stats documentation

## Status
done

## Description

Delete the playback-stats system page and remove Stats-browse / listen-log mentions from the living docs that pointed at it. Index-count `musicweb stats` wording stays. No ADR.

## Rationale

Stages 01–02 already removed the feature. This stage makes the documentation map and ownership pages match the tree so the next reader does not treat listen stats as current product.

## Invariants

- Do not add an ADR or a `docs/architecture/technical-decisions.md` entry about the removal.
- Do not edit `docs/plans/ARCHIVED.md`.
- Do not change `docs/development/commands.md` index-count `musicweb stats` copy except if a sentence still claims it is listen rankings (it should already say counts).
- Do not reintroduce Stats as a browse mode.
- Unripped CD stubs remain documented for identify / rip merge, not for Stats.

## Risks

- `docs/systems/radio.md` and `docs/systems/cd-playback.md` use “listen” in ordinary English (“listeners Tune in”). Strip only the household-listen-cycle sentences, not tuner language.
- `docs/database/overview.md` currently ties unripped stubs to “Stats and later rip merge”; after this stage the sentence must keep the stubs and drop Stats.

## Implementation

### Files

- `docs/systems/playback-stats.md`
- `AGENTS.md`
- `docs/README.md`
- `docs/architecture/index.md`
- `docs/database/overview.md`
- `docs/development/project-structure.md`
- `docs/frontend/conventions.md`
- `docs/product/core-guidelines.md`
- `docs/systems/playback.md`
- `docs/systems/radio.md`
- `docs/systems/cd-playback.md`

### Steps

1. Delete `docs/systems/playback-stats.md`.
2. In `AGENTS.md`, remove the Deep dives bullet that links to `docs/systems/playback-stats.md`. Keep the `musicweb` CLI mention of `stats` (index counts).
3. In `docs/README.md`, remove the systems-map bullet for `docs/systems/playback-stats.md`.
4. In `docs/architecture/index.md`:
   - Delete overview item 6 (**Listen log**) and renumber Household radio and Diagnostics.
   - Remove the Core docs bullet for `playback-stats.md`.
   - In the layers table, change radio’s “Does not own” cell so it no longer lists “listen stats” (keep “live encode pipe” and “stream-cache forget”).
5. In `docs/database/overview.md`, delete the conceptual-areas row **Listen events**. In the CD identities row, drop the “for Stats and later rip merge” phrasing; stubs remain for CD identify / later rip merge and stay not browseable.
6. In `docs/development/project-structure.md`:
   - In the `routes/` row, drop `listens` from the router list.
   - In Ownership, drop “including `listens.py`” from the ORM/repositories bullet.
   - Delete the entire **Listen stats** ownership bullet (`routes/listens.py`, `frontend/src/listens/`, do not add `src/musicweb/listens/`).
   - In Documentation folders, drop `playback-stats` from the `docs/systems/` list.
7. In `docs/frontend/conventions.md`, in the Library UI paragraph, delete the sentences that Stats is a `LibraryView` body (`/stats`, `components/stats/`) and that listen policy lives in `frontend/src/listens/`. Browse chips remain Artists / Albums / Search / Downloads — do not list Stats.
8. In `docs/product/core-guidelines.md`, change **Browse modes** to Artists → Albums → Tracks, Albums grid, Search. Delete “Stats is household most-played…” and the `playback-stats.md` link. Routes stay bookmarkable for the remaining modes.
9. In `docs/systems/playback.md`, remove `docs/systems/playback-stats.md` from the Related list and delete the paragraph “Listen counting is **not** stream or prepare HTTP…”.
10. In `docs/systems/radio.md`, delete the guardrail “Do not infer listens from `/api/stream` or the station clock. Only a tuned-in client starts a cycle.” Do not change “listeners Tune in” product copy.
11. In `docs/systems/cd-playback.md`:
    - In Identify, remove “and can start a listen cycle if the playing row just gained a real `tracks.id`”.
    - Change “Stats and the CD screen use them” so unripped stubs are for the CD screen / later rip merge only.
    - Delete the entire **Listens** section.
    - In Out of scope, remove “Stats origin chip”.

### Verify

- `test -e docs/systems/playback-stats.md` fails (file gone).
- `rg -n "playback-stats|Stats browse|listen_events|frontend/src/listens|routes/listens" AGENTS.md docs --glob '!docs/plans/**'` is empty.
- `rg -n "musicweb stats" docs/development/commands.md` still describes index counts.
- `docs/plans/ARCHIVED.md` and `docs/architecture/technical-decisions.md` are unchanged.
- `docs/systems/cd-playback.md` still documents unripped stubs and does not mention a listen cycle.

## Acceptance

- There is no living playback-stats page. The documentation map and AGENTS deep dives do not link to one.
- Browse-mode docs list Artists, Albums, Search (and Downloads where relevant), not Stats.
- Architecture no longer has a Listen log layer. The database overview has no Listen events area.
- Radio and CD system pages no longer specify a 65% listen cycle. CD stubs are still documented.
- No ADR or technical-decisions note was added. `ARCHIVED.md` was not edited.
- Index-count `musicweb stats` remains documented as counts.
