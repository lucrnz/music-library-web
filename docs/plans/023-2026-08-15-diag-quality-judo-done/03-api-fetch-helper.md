# Stage 03: One `/api` fetch helper

## Status
done

## Description

Put diagnostic headers on every same-origin API call by routing `apiGet`/`apiPost`/`apiPut`/`apiPatch`/`apiDelete`, `requestPrepare`, and `clearCache` through one helper. Ingest flush stays on a raw `fetch`.

## Rationale

Headers on half the HTTP surface is a boundary leak. Cookies already cover `<audio>`; prepare/clear were the actual holes for *header* join keys.

## Invariants

- `streamUrl()` still only has `id` and `codec` query params.
- Response handling of each helper (json, throw on !ok, prepare fire-and-forget) stays the same.
- Diag ingest does not go through this helper.

## Risks

- `requestPrepare` today swallows errors with `.catch(() => {})`. The helper must not start throwing into playlist/player.

## Implementation

### Files

- Change `src/musicweb/static/js/api.js`
- Do **not** change `static/js/diag/log.js` ingest `fetch`

### Steps

1. Add `apiFetch(url, init)` that merges `diagRequestHeaders()` into `init.headers` (caller Content-Type wins if both set — spread order: diag first, then caller).
2. `apiGet`/`apiPost`/`apiPut`/`apiPatch`/`apiDelete` call `apiFetch` only.
3. `requestPrepare` and `clearCache` call `apiFetch` instead of `fetch`. Keep `.catch(() => {})` on those two.
4. Do not export `jsonHeaders` if it becomes a one-liner inside post/put/patch.

### Verify

- `rg "streamUrl" -A 4 src/musicweb/static/js/api.js` — query still `id` + `codec` only.
- `rg "fetch\\(" src/musicweb/static/js/api.js` — only inside `apiFetch` (and not on streamUrl).
- `rg "apiPost\\(\"/api/diag" src/musicweb/static/js` — no matches.
- `rg "fetch\\(\"/api/transcode/prepare\"|fetch\\(\`/api/cache" src/musicweb/static/js/api.js` — no matches.

## Acceptance

- [ ] Prepare and cache-clear send the same diagnostic headers as `apiGet`.
- [ ] Ingest flush is still a dedicated `fetch` in `log.js`.
- [ ] Stream URLs unchanged.
