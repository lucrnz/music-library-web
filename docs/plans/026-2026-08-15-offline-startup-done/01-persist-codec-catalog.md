# Stage 01: Persist codec catalog

## Status
done

## Description

Persist the raw `/api/codecs` payload in `localStorage`. Hydrate and apply stored quality prefs before the network GET. Never persist codec tags against the hardcoded stub.

## Rationale

This is the reported lock-in: failed fetch → one-row stub → `loadPrefs` + `persistAll()` overwrite the user’s tags. A real catalog in `localStorage` plus a non-clobber prefs path makes Settings and ranking honest on offline boot.

## Invariants

- Cached payload is the **unfiltered** server list plus `default`, not the probed `settings.options`.
- Decode probes still run locally after every hydrate and every successful fetch.
- Codec tags (`streamWifi`, `streamCellular`, `download`) are written to `localStorage` only when the in-memory catalog came from cache or server.
- After a real catalog, a stored tag missing from that catalog still falls back (server dropped a profile).
- Without a real catalog, a stored tag is kept even if it is not in the stub; a synthetic option row is injected so pickers and setters still see it.
- `loadCodecs` still does not classify connectivity (stage 02).

## Risks

- First offline launch after this ships, with prefs but no cache: Settings shows stub + synthetic rows (ids / heuristic labels), not the full marketing list. Accept; next online sync fills the cache.
- Corrupt JSON in the new key is ignored (treat as no cache), never throws out of boot.

## Implementation

### Files

- Change `src/musicweb/static/js/stores/settings.js`

### Steps

1. Add `KEY_CATALOG = "musicweb.codecCatalog.v1"`. Shape: `{ codecs: Array<{ id: string, ... }>, default?: string }`. `readCachedCatalog()` / `writeCachedCatalog(data)` wrap `localStorage`; validate `codecs` is a non-empty array of objects with string `id`; on any throw or invalid shape return `null` / no-op.
2. Extract `applyServerCatalog(data)`: set `settings.default` when present; `settings.options = await filterCodecsByDecodeSupport(data.codecs)`; keep the existing `codec.probe.summary` emit. Do not write cache here.
3. Rewrite `loadCodecs`:
   - `cached = readCachedCatalog()`; if present, `await applyServerCatalog(cached)`.
   - `loadPrefs({ catalogIsAuthoritative: !!cached })`, `refreshNetworkFlags()`, set `lastPreparedActive`.
   - Then the existing `apiGet("/api/codecs")` try. On non-empty `data.codecs`: `writeCachedCatalog({ codecs: data.codecs, default: data.default })`, `await applyServerCatalog(data)`, `loadPrefs({ catalogIsAuthoritative: true })`. Empty/missing `codecs`: leave cache and options alone. Catch: keep `console.error`; do not touch cache or re-run `loadPrefs`.
4. Change `loadPrefs` to take `{ catalogIsAuthoritative }`. For wifi / cellular / download: if the stored raw is in `settings.options`, use it; else if stored raw is set and `!catalogIsAuthoritative`, keep the raw and `ensureSyntheticOption(id)`; else use today’s fallbacks (`pickDefault` / `pickDefaultCellular` / `streamWifi`). Playback policy and only-Wi‑Fi unchanged. Call `persistAll()` only when `catalogIsAuthoritative`. When not authoritative, persist **only** policy + only-Wi‑Fi (never rewrite the three codec keys).
5. `ensureSyntheticOption(id)`: if no option has that id, push `{ id, label: id, ...parse-or-empty kind/rates from qualityRank heuristics if you want them, else just id+label }`. Do not import a new module unless `qualityRank.js` already exports a safe helper; a local `kind` from the tag prefix is enough.
6. Do not add timeout, `reportSuccess`, or `reportFailure` in this stage.

### Verify

- `rg "persistAll" src/musicweb/static/js/stores/settings.js` — `persistAll` is not called when `catalogIsAuthoritative` is false.
- `rg "musicweb.codecCatalog.v1" src/musicweb/static/js/stores/settings.js` — read and write exist.
- Manual, online: Settings still lists probed profiles; changing Wi‑Fi/download still persists; DevTools Application shows `musicweb.codecCatalog.v1` with the full `codecs` array (not the filtered-only set if the browser dropped a kind — raw server rows).
- Manual, then disable network and reload: Settings still shows the last list and the last-chosen tags; `musicweb.streamCodec` / `streamCodecCellular` / `downloadCodec` are **not** rewritten to `opus_192_48000`.
- Manual, wipe only `musicweb.codecCatalog.v1`, leave the three codec keys on a non-default tag, reload offline: those tags remain; stub list plus a synthetic row for each kept tag; codec keys still not overwritten.

## Acceptance

- [ ] Offline boot with a prior cache uses that catalog (after local probes) and the user’s stored tags.
- [ ] Offline boot without a cache does not persist default codec tags over stored ones.
- [ ] Online boot writes/replaces the cache from `/api/codecs` and then applies prefs against the probed list.
- [ ] `loadCodecs` still does not call connectivity reporters.
