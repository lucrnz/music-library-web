# Stage 07: Diagnostics guardrails

## Status
done

## Description

Add the durable guardrails from this plan to `docs/systems/diagnostics.md` (and a one-line fetch note in `docs/frontend/conventions.md` if that page already mentions diagnostics). Do not copy event names or header strings.

## Rationale

`design.md` is not living documentation. A future agent will otherwise reintroduce a silent exclusive fail path or a second outbox.

## Invariants

- No exact catalog event names, header names, or cookie names in living docs (same rule as plan 022 stage 07).
- `.env.example` unchanged.

## Risks

None.

## Implementation

### Files

- Change `docs/systems/diagnostics.md`
- Change `docs/frontend/conventions.md` only if the existing diagnostics bullet needs the fetch-helper sentence

### Steps

1. Guardrails to add (intent only): emit from player state seams (not a parallel exclusive logger); one client outbox (memory unacked + IDB mirror); all `/api` fetches share the client helper; ingest validates then writes; stream reject emit is one except; CLI lists files through the store.
2. Do not link `docs/plans/023-…/context/design.md` as current.
3. Keep Errors only / Everything and `musicweb logs` as already written.

### Verify

- `rg "player.load.begin|X-Musicweb-Client|musicweb_play" docs/systems/diagnostics.md docs/frontend/conventions.md` — no matches.
- `.env.example` diff empty.

## Acceptance

- [ ] An agent reading `diagnostics.md` is told not to add a silent exclusive path or a second outbox.
- [ ] Event/header contracts stay in source.
