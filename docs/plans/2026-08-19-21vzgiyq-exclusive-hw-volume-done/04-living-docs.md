# Stage 04: Living docs

## Status
done

## Description

Update the Volume section on the exclusive-audio system page so the hardware-as-path, hog re-apply, and restore-on-release (including companion process stop) contract is documented next to the companion — not only in this plan.

## Rationale

`docs/systems/exclusive-audio.md` already owns exclusive volume intent (“digital required, hardware best-effort”). After stages 01–03 that sentence is incomplete: hardware is the path when a write succeeds, exclusive AO is re-applied, and release / device change / process stop restore pre-hog analog gain. The plan directory is not living documentation.

## Invariants

- Edit the **Volume** section of `docs/systems/exclusive-audio.md` only (plus the existing Source of truth bullet if `volume.py` should be listed).
- Do not add an ADR, a new system page, or a `docs/README.md` entry.
- Do not treat this plan directory as the source of truth after this stage.
- Do not document ctypes selectors, element indexes, class names, or pytest file lists.

## Risks

- None

## Implementation

### Files

- Change: `docs/systems/exclusive-audio.md` (Volume section; Source of truth list may add `volume.py`)
- Do not change: `docs/README.md`, `docs/architecture/technical-decisions.md`, `docs/systems/playback.md`, get-started numbered steps

### Steps

1. Keep “digital mpv volume is required and must not block playback.”
2. State that hog bypasses the Mac mixer, so exclusive at in-app 100% is often quieter than browser playback unless analog gain is written.
3. State the shipped contract: when a hardware volume write succeeds, that write is the slider and mpv stays at unity; otherwise the slider is digital mpv. Each apply picks the path independently.
4. State that the companion re-applies after exclusive AO is up (not only when the slider moves), and restores the pre-hog hardware volume when exclusive is released, the output device changes, or the companion process stops. If the pre-hog level could not be read, it is left alone. Crash/SIGKILL without a clean stop cannot restore.
5. State that Mac volume keys usually do nothing while hogged; the in-app slider is exclusive volume.
6. Source of truth: mention `volume.py` next to `mpv_player.py` / `coreaudio.py` if that list is where companion modules are named.

### Verify

```sh
# docs only
```

Read the Volume section and confirm it matches shipped stages 01–03, not this plan’s file names or selector list.

## Acceptance

- [ ] Volume section states hardware-as-path, digital fallback, hog re-apply, restore (release / device change / process stop), and in-app slider vs system keys.
- [ ] No new doc page; this plan is not cited as the source of truth.
- [ ] Implementation selectors and class names are not copied into the living page.
