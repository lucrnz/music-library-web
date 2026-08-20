# Stage 04: Update living quality docs

## Status
done

## Description

Rewrite the product and system docs so they describe one Streaming setting and download auto-pause for reachability only. Do not leave Wi‑Fi vs cellular stream profiles or Only-download-on-Wi‑Fi as current behavior.

## Rationale

Those pages are the living contract. `context/design.md` is not. If this stage is skipped, the next change will re-learn a product that no longer exists.

## Invariants

- Source-of-truth pointers still name the real modules (`settings.ts`, `queuePolicy.ts`, `connectivity.ts`). They must not name `networkConstraints.ts`.
- High-fidelity encode policy and exclusive-audio prepare rules stay as they are; only the browser stream-tag sentence changes.
- No new ADR. No new page.

## Risks

- Partial edits (README updated, `core-guidelines.md` not) will disagree. Treat the file list as a set, not samples.

## Implementation

### Files

- `docs/product/core-guidelines.md`
- `docs/systems/playback.md`
- `docs/systems/connectivity.md`
- `docs/systems/downloads.md`
- `docs/systems/transcoding.md`
- `docs/systems/exclusive-audio.md`
- `docs/development/testing.md`
- `docs/frontend/conventions.md`
- `docs/architecture/index.md`
- `docs/README.md`
- `README.md`

### Steps

1. **core-guidelines.md** — Quality preferences: one client Streaming setting plus an independent Download setting; playback policy still compares a local file to the active stream tag. Delete “can differ for Wi‑Fi vs mobile data” and “Network cost hints never replace an explicit user setting.” Offline downloads: delete the “only download on Wi‑Fi” sentence.
2. **playback.md** — Quality preferences list is: Streaming profile, Download profile, playback policy. Delete the Cellular stream-profile bullet and “Active stream profile follows the current network constraint state.” Guardrails: delete the Network Information API absence bullet (or replace with nothing — there is no cellular-only UI left).
3. **connectivity.md** — This page is reachability only. Remove “connection cost hints” from the lede, the `networkConstraints.ts` source-of-truth line, and the entire “Connection constraints” section. `autoPauseReason()` is offline / server-down only; downloads no longer extend it for metered links. Consumers list should not include `networkConstraints.ts`.
4. **downloads.md** — Settings that affect downloads: download profile only. Connectivity signals: `connectivity.ts` only. Network policy: auto-pause when hard offline or server unreachable; user pause is separate. Delete cellular / only-on-Wi‑Fi.
5. **transcoding.md** — Client may pick one stream tag and one download tag; `/api/codecs` still exposes bitrate/depth/rate for ranking. Delete “different profile tags for Wi‑Fi vs cellular” and “Network detection is browser-side only.”
6. **exclusive-audio.md** — `getActiveStreamCodec()` is the browser Streaming setting and is unused for exclusive play/prepare. Delete “browser Wi‑Fi/cellular only.”
7. **testing.md** — Store tests mock `@/api`; they do not mock `networkConstraints`. They still do not import `player.ts`.
8. **README.md** — Offline downloads bullet: separate stream and download quality preferences; drop “including Wi‑Fi vs cellular when the browser reports connection type.”
9. **Map pages** — Drop “network cost hints” so they describe reachability only:
   - `docs/frontend/conventions.md`: “Connectivity (online / offline / server_down, network cost hints)”
   - `docs/architecture/index.md`: “`docs/systems/connectivity.md`: reachability and network cost hints.”
   - `docs/README.md`: “online / offline / server_down and network cost hints.”
10. Grep `docs/` and `README.md` (excluding `docs/plans/`) for `cellular`, `Wi‑Fi vs`, `only download on Wi‑Fi`, `networkConstraints`, `connection.type`, `Data Saver`, `metered`, `streamCellular`, and `network cost hints`. Remaining hits must be historical only if any, and not phrased as current product.

### Verify

- `rg -n -i "cellular|networkConstraints|only download on Wi|streamCellular|connection\\.type|Data Saver|network cost hints" docs README.md --glob '!docs/plans/**'`
- Read the Quality preferences and Offline downloads bullets in `docs/product/core-guidelines.md`, the Quality preferences list in `docs/systems/playback.md`, and the connectivity one-liners in `docs/frontend/conventions.md`, `docs/architecture/index.md`, and `docs/README.md`, and confirm they match stages 01–03.

## Acceptance

- Living docs describe one Streaming setting and do not document a network-selected stream codec.
- Living docs do not document Only-download-on-Wi‑Fi, a `metered` download pause, or “network cost hints.”
- `networkConstraints.ts` is not listed as a source of truth.
- Exclusive-audio and transcoding pages no longer say the browser stream tag is Wi‑Fi/cellular-split.
- `docs/frontend/conventions.md`, `docs/architecture/index.md`, and `docs/README.md` describe connectivity as reachability only.
