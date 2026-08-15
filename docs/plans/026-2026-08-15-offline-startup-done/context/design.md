> **Archive.** Decisions in this file were current as of 2026-08-15 (the plan date in the directory name). They may be outdated. Do not treat this as living documentation. This plan directory is an archive.

# Offline startup and download playback

## Goal

An already-installed PWA can open with no usable library server and play OPFS downloads at the quality the user last chose. The codec catalog and quality prefs survive offline boot. Other launch/play blockers in that path are removed; online library browse may still fail.

## Settled decisions

- **Catalog cache:** persist the raw `GET /api/codecs` payload (profile rows + `default`) in `localStorage`. Re-run local decode probes on every boot. Do not persist the already-filtered list.
- **Hydration:** apply the cached catalog and stored quality tags **before** any network wait. A successful boot GET replaces the cache. Startup only — no reconnect refresh.
- **Stub is not a catalog:** the hardcoded one-item `opus_192_48000` default is not a successful catalog. Never `persistAll()` codec tags against it. After a real catalog (cache or server), unknown tags may fall back.
- **Upgrade without a cache:** keep stored tags even when they are not in the stub; inject synthetic option rows so Settings membership checks still see them. Next online sync writes a real cache.
- **Play reachability:** boot connectivity stays optimistic (`online`, no toast flash). Play treats the server as reachable only after a successful API this page lifetime (`reportSuccess` from codecs, browse, or health). Until then a playable download wins. Failed or timed-out boot codecs GET reports `server_down`. Do not add stream-fail → local while confirmed reachable (plan 018).
- **`canReachServer()` unchanged:** it stays `state === "online" && !browserOffline()`. Play (and player remote covers) add a session-confirmed conjunct. Prepare and download-queue policy keep using `canReachServer()`.
- **SW install:** any precache URL failure aborts install. Keep the previous complete cache rather than activate a hole (vue-router and app modules are not optional).
- **Downloads enable flag:** boot failure must not persist `enabled=false`. Only explicit disable writes that. In-memory error is allowed.
- **Exclusive out of scope:** no exclusive-formats cache; exclusive-on still needs the companion and is not an HTML/OPFS fallback.
- **Landing:** do not auto-route to Downloads or restore last pane. `/` → `/folders` may show the existing load error. Downloads tab is enough.
- **Living docs last:** `playback.md`, `connectivity.md`, `pwa.md`, `downloads.md`. This directory is not living documentation.

## Design

Two lies at boot cause the reported bug and the usual “Wi‑Fi up, LAN server off” play miss.

**Catalog.** `loadCodecs` fetches `/api/codecs` (never SW-cached), and on failure leaves a one-row stub. `loadPrefs` then validates stored tags against that stub and `persistAll()` overwrites them. Offline boot therefore locks quality to `opus_192_48000`. Fix: a versioned `localStorage` catalog; hydrate + probe + prefs first; fetch only to refresh; persist codec tags only against a real catalog.

**Reachability.** Platform state starts `online`. `canReachServer()` is therefore true until something classifies a failure. `loadCodecs` does not report. The user can play from a restored queue before `/api/browse` fails. Online policy then picks `/api/stream` (`prefer_stream`, or `prefer_better` when the local file ranks below the stream tag) and there is no stream → OPFS fallback. Fix: a session flag set by `reportSuccess`; play-source “online” requires that flag; the boot codecs GET is a reachability probe (timeout + `reportSuccess` / `reportFailure`).

**Launch.** The SW may finish install with missing non-critical URLs (vue-router is not critical). Activate then deletes other `musicweb-*` caches. Next offline navigation 503s a module and Vue never mounts. Fail-closed install: any inventory miss aborts, previous cache stays.

**Downloads flag.** `initDownloads` catch persist-writes `enabled=false`, so a transient OPFS/IDB error hides the catalog on every later launch. Surface the error; leave the stored flag as the user set it.

Shell-only SW, OPFS audio, and quiet connectivity UX stay as they are.

## Stage map

1. **Persist codec catalog** — deletes the clobber. Prefs and Settings are honest before any play/reachability work. Fetch still does not classify connectivity.
2. **Session reachability + play** — depends on 01 so hydrated prefs exist when play resolves. Adds the confirmed flag, wires the same boot GET as a probe, and changes the play-source online test. Prepare/queue stay on `canReachServer()`.
3. **SW fail-closed** — independent of 01–02. Launch must work before play matters on a holey install; ordered after the every-session play path because partial install is the rarer failure.
4. **Downloads boot flag** — independent one-file persist fix. After play/launch so the common path is already correct.
5. **Living docs** — last so the four systems pages describe what 01–04 shipped.

## Out of scope

- Exclusive-formats persistence and exclusive → HTML/OPFS fallback.
- Auto-land on Downloads or last-route restore.
- Stream-fail → local while `canReachServer()` and the session is confirmed.
- Caching `/api/*` in the service worker.
- First-ever offline with no prior online visit (no shell, no catalog cache).
- Reconnect codec refresh; mid-session catalog poll.
- A JS test runner.

## Assumptions

- Frontend verification is manual (`uv run musicweb`) plus `rg` / inspection. No JS harness.
- Users who can play offline have already opened the app online once (SW installed, downloads enabled, at least one catalog sync after this ships — except the upgrade-without-cache path, which keeps stored tags).
- `qualityRank` heuristics still rank unknown `flac_*` / `opus_*` tags if the catalog is thin.
- Plan 018’s “no stream-fail → local while reachable” remains in force once the session has confirmed.
- `reportSuccess` already runs from library load and health recovery; play confirmation is that same signal, not a fourth state.
- Decode probes use embedded fixtures and do not need the network.
