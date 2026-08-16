# Stage 01: Codecs probe no-store

## Status
done

## Description

The boot `GET /api/codecs` must not be satisfied from the browser HTTP cache, so `reportSuccess()` means the origin answered.

## Rationale

A cached 200 while the library server is down confirms the session. Play then follows online policy and can hit a dead `/api/stream`.

## Invariants

- Only this boot codecs GET adds `cache: "no-store"`. Other `apiGet` callers unchanged.
- Abort timeout, `reportSuccess` on HTTP OK, `reportFailure` on error/timeout, and catalog hydrate/persist stay as 026 shipped them.
- SW still never caches `/api/*`.

## Risks

- Every launch hits the origin for codecs even if a fresh HTTP cache exists. Cheap JSON; accept.

## Implementation

### Files

- Change `src/musicweb/static/js/stores/settings.js`

### Steps

1. In `loadCodecs`, pass `cache: "no-store"` on the codecs fetch: `apiGet("/api/codecs", { signal: ctrl.signal, cache: "no-store" })`.
2. Do not change `apiFetch` / `apiGet` defaults.

### Verify

- `rg "apiGet\\(\"/api/codecs\"" src/musicweb/static/js/stores/settings.js` — the call includes `cache: "no-store"`.
- `rg "cache: \"no-store\"" src/musicweb/static/js` — codecs GET plus the existing `/api/health` probe in `connectivity.js`. Do not add a third fetch wrapper.
- Manual: DevTools → Network → `/api/codecs` shows `cache: no-store` / Disk cache miss on reload.

## Acceptance

- [ ] Boot codecs GET cannot succeed from a cached response while the origin is down.
- [ ] Cache hydrate + persist + 4s abort + success/failure reporting are unchanged.
- [ ] Other API GETs are not forced to `no-store`.
