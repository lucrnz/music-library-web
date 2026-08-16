# Stage 05: Living docs

## Status
done

## Description

Record the shipped offline-startup invariants on the four systems pages. Do not treat this plan directory as living documentation.

## Rationale

Catalog persistence, session-confirmed play, fail-closed SW install, and the downloads enable-flag rule will rot if they only live in `docs/plans/026-…`.

## Invariants

- Source of truth for request shapes, storage keys, timeout ms, and SW argv stays in source. Docs state intent and guardrails.
- Plan 018’s “no stream-fail → local while reachable” remains, with “reachable” for **play** meaning confirmed this session.

## Risks

None

## Implementation

### Files

- Change `docs/systems/playback.md`
- Change `docs/systems/connectivity.md`
- Change `docs/systems/pwa.md`
- Change `docs/systems/downloads.md`

### Steps

1. **playback.md — Quality preferences:** the browser catalog is fetched at boot when possible and stored locally (raw `/api/codecs` payload). Offline / failed fetch uses that cache; prefs are not rewritten against the stub list. Decode probes still run locally. Point at `settings.js`.
2. **playback.md — Delivery source:** play-source “online” means `canReachServer()` **and** this page has seen `reportSuccess` (`hasConfirmedReachability`). Until then a playable download wins. Hard offline / `server_down` unchanged. Do not claim stream-fail → local.
3. **connectivity.md:** boot state stays optimistic `online` (no toast flash). `canReachServer()` unchanged. New session flag set by `reportSuccess`; play and player remote covers require it. Boot `GET /api/codecs` is a reachability probe (timeout → `server_down`). Do not add a fourth published state.
4. **pwa.md — Request handling / guardrails:** install is fail-closed on the full precache inventory. A miss keeps the previous worker. Still never cache `/api/*`.
5. **downloads.md — Behavior / guardrails:** `initDownloads` failure must not persist the enable flag off; only explicit disable (and failed explicit enable) do.

### Verify

- Read the four pages: no leftover “catalog is memory-only” or “full inventory precached” without fail-closed.
- `rg "hasConfirmedReachability|codecCatalog" docs/systems` — playback + connectivity mention the flag / cache; no plan-026 path presented as living SOT.

## Acceptance

- [ ] playback.md documents cached catalog + non-clobber prefs + session-confirmed play online.
- [ ] connectivity.md documents optimistic boot vs confirmed play, and the codecs probe.
- [ ] pwa.md documents fail-closed install.
- [ ] downloads.md documents the enable-flag persist rule.
- [ ] This plan directory is not linked as living documentation.
