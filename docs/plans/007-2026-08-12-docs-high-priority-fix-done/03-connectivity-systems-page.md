# Stage 03: Connectivity systems page

## Status
done

## Description

Add `docs/systems/connectivity.md` for the client three-state connectivity model, health probing, network-constraint detection, and how connectivity feeds downloads queue and playback — intent and boundaries only.

## Rationale

Connectivity is a cross-cutting client system (`online` / `offline` / `server_down`) that PWA and product only mention in passing. Without a home page, download pause and play-block behavior get reimplemented from code comments.

## Implementation

1. Create `docs/systems/connectivity.md` with overview → **Source of truth** → design → **Guardrails**.
2. **Source of truth:** `static/js/connectivity.js`, `connectivityUi.js`, `networkConstraints.js`, `stores/connectivity.js` if present; link downloads queue policy and player as consumers (path-level). Cross-link `docs/systems/pwa.md` (quiet UX / shell offline) and `docs/systems/downloads.md`.
3. Document durable intent:
   - States: browser offline vs server unreachable vs online (exact enum names from source).
   - Health probe / recovery loop purpose (not timer constants unless they are product decisions).
   - Connection-type constraints (cellular vs unrestricted) used for stream quality and download-on-Wi‑Fi — browser-reported when available; not a substitute for user settings.
   - UX: quiet transitions (toasts/banner policy as already described in PWA/product); no screaming offline mode.
4. **Guardrails:** do not treat LAN HTTP install failure as connectivity failure; do not conflate SW shell offline with media offline; downloads/player own their reactions — connectivity owns state + signals.
5. Avoid copying backoff intervals, probe URLs, or toast copy lists unless they are stable product contracts.
6. Do not update the documentation map yet (stage 05).
