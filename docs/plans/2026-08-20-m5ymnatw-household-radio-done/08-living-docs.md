# Stage 08: Living docs

## Status
done

## Description

Write the durable radio page and update maps, setup, product, playback, transcoding, architecture, frontend, database, testing, and `AGENTS.md` so they match the shipped encode+seek station. Include exclusive-radio TODO. Do not document a live pipe or a radio lossy-reencode exception.

## Rationale

`context/design.md` is not living documentation. Operators and later agents need the 24/7 rules, ffprobe requirement, and out-of-scope DJ/exclusive notes in the normal docs tree.

## Invariants

- Docs stay at intent, ownership, and guardrails. Exact payload shapes, table columns, and ffmpeg argv stay in source.
- Do not copy [picking.md](context/picking.md) verbatim; the living page states the rules and points at `src/musicweb/radio/`.
- On-demand lossy-as-stored remains the product rule. Radio uses that same path (`source`). Do not add a radio re-encode exception.

## Risks

- Leftover “live encoder” / “radio re-encodes lossy” sentences will send the next agent back to the rejected design.

## Implementation

### Files

- `docs/systems/radio.md` (create)
- `docs/README.md`
- `docs/setup.md`
- `docs/development/commands.md`
- `docs/development/environment.md` (only if a new env var appeared — none should have)
- `docs/development/project-structure.md`
- `docs/development/testing.md`
- `docs/architecture/index.md`
- `docs/architecture/technical-decisions.md`
- `docs/product/core-guidelines.md`
- `docs/systems/playback.md`
- `docs/systems/playback-stats.md`
- `docs/systems/transcoding.md`
- `docs/systems/exclusive-audio.md`
- `docs/frontend/conventions.md`
- `docs/database/overview.md`
- `docs/database/migrations.md` (workflow only; do not list new columns)
- `AGENTS.md`

### Steps

1. Add `docs/systems/radio.md`: household station; simulation vs tuners; complete-file `/api/stream` + seek; pick path (album artist → album → track); 30s floor; batch/banlist/loosening; ffprobe requirement; no queue spoilers (UI/API/logs); DB rows are an accepted spoiler; Tune in/out and radio chrome; now-playing layout matches on-demand; Media Session play/stop only; radio-owned audio element; exclusive radio TODO; no listen stats; no remote DJ; no live pipe. Source-of-truth pointers into `src/musicweb/radio/`, `routes/radio.py`, `frontend/src/stores/radio.ts`.
2. Setup + commands: ffprobe on PATH; doctor fails without it.
3. Architecture: add the radio clock + tuner-driven `Transcoder` prepare to the single-process map. It is not a second encoder.
4. Technical decisions: ffprobe is required; radio reuses `Transcoder` / `/api/stream`; no live stdout radio path.
5. Product guidelines: Radio tab; honest codecs; lossy-as-stored for on-demand **and** radio; exclusive radio TODO.
6. Playback: radio is not stream-vs-download resolve; instructed seek only; display clocks; stopped radio face; library play exits radio.
7. Playback-stats: radio must not start a listen cycle.
8. Transcoding: radio and `/transcode/prepare` share `enqueue_prepare`; idle wipe unchanged; radio must not call `drop_pending_prewarm`; radio jobs log `log_label` + profile tag, not paths. Vite `/api` proxy has `ws: true`.
9. Exclusive-audio: Tune-in stops the hog; radio is HTML-only until a future exclusive-radio design.
10. Frontend conventions: third tab + desktop replace; `radio.ts` owns the socket; `RadioNowPlaying` `room`/`bar` + `RadioMini`; SettingsModal omits `playIndex`; tuner codec is a profile, never `source`; do not add a ModeBar chip.
11. Database overview: radio tables are station bookkeeping, not a user-facing queue.
12. Testing: radio picker/clock/tuner/protocol tests mock ffprobe/`Transcoder` and hit extracted helpers; do not import `player.ts`; do not boot `create_app` / TestClient.
13. `AGENTS.md`: ffprobe required; link `docs/systems/radio.md`; do not add a lossy transcode path.
14. README map: one line under systems.

### Verify

- Grep living docs for “live encoder”, “concat”, “radio re-encode”, and leftover “lossy is never re-encoded” that would contradict radio-as-stored (on-demand sentence can stay if it still applies to `/api/stream` generally).
- Grep for “ffprobe” in setup, commands, and `AGENTS.md`.
- Confirm `docs/systems/radio.md` states exclusive radio as TODO, forbids queue spoilers, and describes encode+seek (not a live pipe).

## Acceptance

- A new developer can operate and extend radio from `docs/systems/radio.md` plus the source pointers.
- ffprobe is documented as a hard requirement.
- On-demand and radio both play lossy as stored. There is no documented radio re-encode exception.
- Exclusive radio is explicitly TODO, not implied to work.
- Plan context files remain historical; they are not linked as the living spec.
