# Stage 03: Living docs for the entry gate

## Status
done

## Description

Update the durable CD and frontend convention pages so the desktop icon and mobile CD tab are described as absent until Enable CD playback is on and a drive is picked. Do not treat `context/design.md` as living documentation.

## Rationale

`docs/systems/cd-playback.md` currently says an installed Mac PWA shows CD chrome. After stages 01–02 that sentence is false for the face/room toggle and the tab.

## Invariants

- Durable home stays `docs/systems/cd-playback.md`. No ADR.
- Source of truth for the exact predicate stays `cdEntryAllowed()` in `frontend/src/stores/cd.ts`.
- Archived plans under `docs/plans/` keep their historical wording.
- Settings still appear on a capable Mac PWA; do not write that Settings hide when Enable is off.

## Risks

- A conventions sentence that still says “plus CD on an installed Mac PWA” with no Enable/drive clause will send the next agent back to always-on chrome.

## Implementation

### Files

- `docs/systems/cd-playback.md`
- `docs/frontend/conventions.md`

### Steps

1. In `docs/systems/cd-playback.md` **Gating**, keep “only an installed Mac Chromium PWA shows CD Settings.” Add that the desktop session toggle and the mobile CD tab appear only when Enable CD playback is on **and** a drive is picked. Drive missing does not hide them. Disabling CD, or having no pick, leaves a live CD session.
2. In **Session**, say the desktop CD icon is absent until that same condition, and that it remains a session toggle once shown. Do not paste `cdEntryAllowed` source.
3. In `docs/frontend/conventions.md`, the mobile tab-bar sentence and the “Desktop Queue header CD icon is a session toggle” clause get the same Enable + picked-drive qualifier. One or two sentences, no chrome inventory.
4. Grep living docs (exclude `docs/plans/`) for leftover “always” / unqualified “Mac PWA shows CD chrome” claims:

```sh
rg -n "CD (chrome|icon|tab)|canShowCdUi" docs --glob '!docs/plans/**'
```

No remaining living sentence should say the Queue icon or CD tab appears on every capable Mac PWA regardless of Settings.

### Verify

```sh
rg -n "Enable CD playback|session toggle|CD tab" docs/systems/cd-playback.md docs/frontend/conventions.md
```

Both pages state the extra Enable + drive gate. No code test run unless a later edit accidentally touched source.

## Acceptance

- `docs/systems/cd-playback.md` and `docs/frontend/conventions.md` say the face/room toggle and mobile CD tab stay hidden until Enable is on and a drive is picked.
- Settings remain capable-PWA chrome, not Enable-gated.
- `docs/plans/` archives are untouched.
