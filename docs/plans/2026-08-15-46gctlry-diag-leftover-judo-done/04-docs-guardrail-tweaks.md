# Stage 04: Docs guardrail tweaks

## Status
done

## Description

Update the existing `diagnostics.md` guardrail sentences so they match stages 01–03. Do not add event, header, or cookie names.

## Rationale

023’s living docs still say ingest rotates and describe the outbox without forbidding an IDB-first trim. Those sentences would teach the leftovers this plan deletes.

## Invariants

- No exact catalog event names, header names, or cookie names in living docs.
- `.env.example` unchanged.
- Do not link `docs/plans/024-…/context/design.md` as current.

## Risks

None.

## Implementation

### Files

- Change `docs/systems/diagnostics.md`
- Do **not** change `docs/frontend/conventions.md` unless a sentence still claims route-level rotate or an IDB-peer trim (it should not)

### Steps

1. Replace the ingest guardrail so validation stays on the route and the **store** writes the batch (rotate included). Do not say the route rotates.
2. Keep “one client outbox (memory list + IDB mirror).” Add that IDB must not be trimmed independently of that list.
3. Stream: keep “one exception path.” Add that success emit happens once after the file is chosen.
4. Leave Errors only / Everything and `musicweb logs` as already written.

### Verify

- `rg "player.load.begin|X-Musicweb-Client|musicweb_play" docs/systems/diagnostics.md docs/frontend/conventions.md` — no matches.
- `.env.example` diff empty.
- `rg "rotate" docs/systems/diagnostics.md` — if present, it is the store’s job, not ingest’s.

## Acceptance

- [ ] An agent reading `diagnostics.md` is not told to rotate from the ingest route or to trim IDB as a peer of `unacked`.
- [ ] Event/header contracts stay in source.
