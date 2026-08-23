# Stage 03: Living docs

## Status
done

## Description

Record Desktop companion (`musicweb companion`) and `COMPANION_TOKEN` in the operator and architecture docs that outlive this plan. Keep `docs/systems/exclusive-audio.md` as the exclusive-feature system doc.

## Rationale

`context/design.md` is not living documentation. After stages 01–02 the argv and Settings strings are real; docs must match them or operators will keep running `exclusive-audio`.

## Invariants

- Docs describe intent and commands, not Typer registration details or localStorage key names.
- Exclusive audio remains the feature name; Desktop companion is the sidecar process.
- Do not rewrite `docs/plans/ARCHIVED.md`.
- Do not add a second system doc for the companion.

## Risks

None

## Implementation

### Files

- `docs/development/commands.md`
- `docs/systems/exclusive-audio.md`
- `docs/development/project-structure.md`
- `docs/architecture/technical-decisions.md`
- `docs/README.md`
- `.env.example`

### Steps

1. In `docs/development/commands.md`, retitle **Exclusive audio companion (macOS)** to **Desktop companion (macOS)**. Document `uv run musicweb companion`, `COMPANION_TOKEN`, `--port` / `--mpv`, loopback-only, no data-dir lock. Point get-started at `docs/systems/exclusive-audio.md`. Update any `#exclusive-audio-companion-macos` anchors to `#desktop-companion-macos`.
2. In `docs/systems/exclusive-audio.md`, get-started and architecture: `uv run musicweb companion`, `COMPANION_TOKEN`, source-of-truth CLI path `src/musicweb/cli/companion.py`. Commands link uses the new heading anchor. Diagram/process labels say Desktop companion / `musicweb companion`. Keep exclusive hog/format/client policy as-is.
3. In `docs/development/project-structure.md`, `cli/` ownership lists `companion` instead of `exclusive-audio`. `exclusive/` stays the exclusive-audio feature package, started by the Desktop companion.
4. In `docs/architecture/technical-decisions.md`, keep **Exclusive audio via optional companion (not Electron)**. Name Desktop companion (`musicweb companion` + mpv) as the Mac sidecar; exclusive playback remains the feature; still not Electron; still no data-dir lock.
5. In `docs/README.md`, the `exclusive-audio.md` map line names Desktop companion (`musicweb companion`) as the Mac sidecar process.
6. In `.env.example`, retitle the block to Desktop companion and document `COMPANION_TOKEN` as the shared secret for `musicweb companion` and Mac PWA → Settings → Exclusive audio. Remove `HOG_TOKEN`.

### Verify

Read the six files against [context/design.md](context/design.md) and `src/musicweb/cli/companion.py` help text. Grep living docs (not `docs/plans/`) for `exclusive-audio` as a command and for `HOG_TOKEN`; the only remaining `exclusive-audio` hits should be the system doc path `docs/systems/exclusive-audio.md` and feature wording. No code tests.

## Acceptance

- `commands.md` documents `uv run musicweb companion` and `COMPANION_TOKEN`.
- `exclusive-audio.md` get-started matches that command and env name.
- `technical-decisions.md` and `project-structure.md` name Desktop companion as the sidecar and exclusive audio as the feature.
- `.env.example` has `COMPANION_TOKEN` and no `HOG_TOKEN`.
- This plan directory is not referenced as living documentation.
