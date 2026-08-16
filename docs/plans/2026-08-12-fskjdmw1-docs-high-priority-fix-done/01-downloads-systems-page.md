# Stage 01: Offline downloads systems page

## Status
done

## Description

Add `docs/systems/downloads.md` as a strategy-standard durable page for the client offline-downloads system (OPFS + IndexedDB catalog/queue, enable flag, Wi‑Fi-only policy, near-quota, play/catalog interaction at intent level).

## Rationale

Downloads is the largest client subsystem (~3.5k LOC) and only has an import map in frontend conventions plus product bullets. A dedicated systems page owns intent, ownership boundaries, and guardrails so plans and conventions stop acting as the design record.

## Implementation

1. Create `docs/systems/downloads.md` with: title/overview → **Source of truth** → design/behavior → **Guardrails**. Optional short “ownership / import surface” if it stays durable.
2. **Source of truth** (files/dirs, not line dumps): `static/js/downloads/` (especially `index.js`, `ui.js`, `state.js`, `catalog.js`, `queue.js`, `queuePolicy.js`, `worker.js`, `opfs.js`, `resolve.js`, `db.js`), plus related settings/connectivity touchpoints by path only.
3. Document durable intent only:
   - Optional feature; must not write server index.
   - Audio in OPFS; metadata/queue/catalog in IndexedDB (as implemented — verify before writing).
   - Enable flag, queue lifecycle, Wi‑Fi-only pause when connection type is detectable.
   - Near-quota confirm is UI-layer (`ui.js`); pure enqueue stays in lifecycle modules.
   - Complements PWA shell (shell ≠ offline music).
4. **Guardrails:** no server-index corruption; no SW caching of audio as a substitute; do not re-grow a god barrel on `index.js`; secrets/network keys stay server-side.
5. Do **not** copy schemas, IDB object-store shapes, or exhaustive export lists. Prefer “go to these modules” over inventories that will rot.
6. Do not update the documentation map yet (stage 05).
