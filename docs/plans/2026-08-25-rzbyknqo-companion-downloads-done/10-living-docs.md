# Stage 10: Living docs

## Status
done

## Description

Write the shipped storage-line and companion-disk Downloads contract into living docs. Add `docs/systems/companion.md` for the sidecar’s second capability. Make **product** docs explicit about platform support (first-party / second-party / out of scope) and point agents at that table from `AGENTS.md`. `context/design.md` is not living documentation.

## Rationale

Durable intent (backends, catalog owner, exclusive lossy, migrate, who we support) will rot if it only lives in this plan directory.

## Invariants

- Docs state intent and ownership, not WS field lists or exact file key strings.
- New companion page is linked from `docs/README.md`.
- The three-tier platform table lives only in `docs/product/core-guidelines.md`. `AGENTS.md` gets one hard-rule line plus a link — it does not copy the table. Systems pages link; they do not restate the tiers.
- The platform table does not mention exclusive hog. Windows hog WIP stays on `docs/systems/exclusive-audio.md`.
- `docs/plans/ARCHIVED.md` is not edited.

## Risks

- Exclusive-audio “Windows/Linux companion out of scope” is now wrong for the process (hog still Mac-only). Update that sentence or the page will lie.
- Calling first-party “Chrome only” would contradict current testing (Chromium/Brave) and the “any Chromium PWA” decision.

## Implementation

### Files

- `docs/systems/companion.md`
- `docs/systems/downloads.md`
- `docs/systems/exclusive-audio.md`
- `docs/systems/playback.md`
- `docs/frontend/conventions.md`
- `docs/development/commands.md`
- `docs/development/project-structure.md`
- `docs/architecture/technical-decisions.md`
- `docs/product/core-guidelines.md`
- `AGENTS.md`
- `docs/README.md`

### Steps

1. Create `docs/systems/companion.md`: sidecar is loopback FastAPI + mpv; jobs are exclusive hog **and** the Downloads blob store; data dir is OS app-support (print on launch, no env override); token `COMPANION_TOKEN`; any authenticated session may command blobs; hog stays controller-only; source-of-truth pointers to `src/musicweb/exclusive/` and `frontend/src/exclusive/`. Guardrails: loopback only, no library lock, no token in logs.
2. Update `docs/systems/downloads.md`: two backends (OPFS vs companion disk); IDB catalog of record; storage line rules (OPFS used-only; companion used + real free); no near-quota; companion auto-pause; desktop tab / PWA enable gates; migrate Yes/Later; art included in used. Point blob I/O at companion, not only `opfs.ts`.
3. Update `docs/systems/exclusive-audio.md`: exclusive consumes the locker via playback policy; lossy plays local or streams `source` (no FLAC remux); download quality + policy stay visible; Settings split; Windows/Linux run the companion for Downloads without hog. Say Windows hog is WIP / pending on this page only. Remove or narrow “Windows or Linux companion binary” from v1 out of scope. Link the new companion page and the product platform table — do not copy the tiers here.
4. Update `docs/systems/playback.md`: exclusive is not “never OPFS” only — it may play a companion (or leftover OPFS HTML) download; `exclusive_lossy` is the no-source-url case; `play_source` downloaded includes companion files.
5. Update `docs/frontend/conventions.md` downloads / exclusive bullets for the backend split and CompanionPanel.
6. Update `docs/development/commands.md` Desktop companion section: data dir print, blob store, Win/Linux process (hog still Mac).
7. Update `docs/development/project-structure.md` `exclusive/` row: hog + blob store, still no library lock.
8. Update `docs/architecture/technical-decisions.md`: exclusive lossy is no longer a blanket refuse; companion second capability; offline audio on desktop PWA is companion disk.
9. Update `docs/product/core-guidelines.md`: keep the offline-downloads bullet (OPFS on Android / leftover; companion disk on installed desktop PWA). Add a **Platform support** section with the only copy of the three-tier table:
   - **First-party:** Windows, macOS, Android — any Chromium PWA (Chrome, Brave, Edge, unbranded Chromium). This is the focus. Current developer testing is Chromium/Brave.
   - **Second-party:** Linux Chromium PWA. Implement the same desktop features (do not skip Linux). Testing is best-effort when someone has a Linux box. Do not block a change on Linux testing if you are not on Linux.
   - **Out of scope:** iOS, Safari, Firefox, and everything else. Best-effort if the engine happens to work. Agents do not implement, test, or prioritize those clients.
   Feature exceptions (exclusive hog = Mac only) do not belong in this table.
10. In `AGENTS.md` **Hard rules**, add one line: platform support is first-party / second-party / out of scope — follow `docs/product/core-guidelines.md`. Do not paste the table. Deep dives already link that page.
11. List `docs/systems/companion.md` in `docs/README.md` next to exclusive-audio and downloads.

### Verify

```sh
# no automated doc tests — read the pages named in Files
```

## Acceptance

- A reader can find which client uses OPFS vs companion, who owns the catalog, and that exclusive can play lossy via `source` or a local file.
- `docs/product/core-guidelines.md` is the only full platform table (first-party Chromium PWA on Windows/macOS/Android; second-party Linux Chromium PWA; out of scope iOS/Safari/Firefox). `AGENTS.md` points at it and does not duplicate it.
- `docs/systems/companion.md` exists and is in the documentation map.
- Exclusive-audio names Windows hog as WIP; the platform table does not.
- No WS payload tables or blob key strings copied into docs.
- This plan’s `context/design.md` is not linked as living documentation.
