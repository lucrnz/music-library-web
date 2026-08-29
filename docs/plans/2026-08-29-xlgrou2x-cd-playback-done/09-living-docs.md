# Stage 09: Living docs

## Status
done

## Description

Write durable CD playback documentation in the normal docs tree and point the map at it. Do not treat this plan directory as the spec after merge.

## Rationale

`context/design.md` dies with the plan. Operators and agents need a systems page plus the usual ownership/guardrail updates.

## Invariants

- Do not copy TOC JSON, WAV byte maps, or encoder-style argv into docs. Those stay in source (`src/musicweb/cd/`, `src/musicweb/exclusive/cdda_stream.py`).
- Prefer updating existing pages over new ones except the new systems page.
- `design.md` is not living documentation.

## Risks

None

## Implementation

### Files

- `docs/systems/cd-playback.md`
- `docs/systems/companion.md`
- `docs/systems/exclusive-audio.md`
- `docs/systems/playback.md`
- `docs/systems/playback-stats.md`
- `docs/frontend/conventions.md`
- `docs/product/core-guidelines.md`
- `docs/development/commands.md`
- `docs/development/project-structure.md`
- `docs/development/environment.md`
- `docs/database/overview.md`
- `docs/README.md`
- `AGENTS.md`

### Steps

1. Add `docs/systems/cd-playback.md`: product intent (software deck, Mac PWA + companion, no rip), gating, settings, CD cursor (pane is a view; no stash), identify (lookup vs confirm DTO), bind vs hidden rows, live virtual WAV, hog-or-auto `load`, eject, correction policy, status vocabulary, listens, out-of-scope (data CD, Windows reader, restream). Source-of-truth pointers to `src/musicweb/exclusive/optical.py`, `cdda_stream.py`, `src/musicweb/cd/`, `frontend/src/stores/cd.ts`.
2. `docs/systems/companion.md`: third job (optical + virtual WAV + eject) beside hog and Downloads; optional libcdio/libcdio-paranoia; stub on Windows/Linux; `load` `hog` flag.
3. `docs/systems/exclusive-audio.md`: CD uses the same mpv; hog if armed; auto if exclusive off; CD owns the compact face; mid-play exclusive toggle reloads.
4. `docs/systems/playback.md` and `docs/frontend/conventions.md`: `ActiveSession` includes `cd`; `player.ts` ↛ `cd.ts`; playlist store is not a CD API; delivery `cd` is companion loopback via `cdLoad.ts`, not `resolvePlayIntent`.
5. `docs/systems/playback-stats.md`: `origin=cd`, `play_source=cd`, only MB-identified rows, no chip.
6. `docs/product/core-guidelines.md`: CD is a narrower Desktop-PWA feature (Mac now).
7. `docs/development/commands.md` / `environment.md`: optional `brew install libcdio libcdio-paranoia`; identify needs `MUSICBRAINZ_CONTACT_EMAIL` (already documented for portraits).
8. `docs/development/project-structure.md`: `cd/` package on the server; `exclusive/` optical; frontend `stores/cd.ts` + `components/cd/`.
9. `docs/database/overview.md`: `cd_identities` + hidden `cd-discid` tracks are not the media archive.
10. `docs/README.md` and `AGENTS.md`: one-line pointers to the new systems page. Deep-dives list in `AGENTS.md` gets CD playback.

### Verify

Read the new page and each edited page’s CD paragraph. Confirm no plan-directory link is presented as the living spec. Confirm commands still tell operators to verify flags in `pyproject.toml` / `.env.example` / source.

## Acceptance

- A new agent can find gating, the no-rip rule, identify precedence, and the live-WAV decision from `docs/systems/cd-playback.md` without opening this plan.
- Companion / exclusive / playback / stats / conventions / structure / README / AGENTS all mention CD where they own a boundary.
- No TOC/WAV byte tables copied into docs.
