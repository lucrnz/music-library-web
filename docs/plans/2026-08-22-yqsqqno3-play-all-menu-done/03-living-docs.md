# Stage 03: Living docs

## Status
done

## Description

Record Play all in the frontend menu conventions and the playback forget / start-at-0 rules so later menu or queue work does not treat replace as undefined.

## Rationale

`context/design.md` is not living documentation. The shipped label, surfaces, and forget rule belong next to the existing Add-all and Forget paragraphs.

## Invariants

- Docs describe the behavior stages 01–02 shipped. Do not invent extra surfaces (no page pill, no track twin).
- Do not treat this plan directory as the long-term home of the decision.

## Risks

None

## Implementation

### Files

- `docs/frontend/conventions.md`
- `docs/systems/playback.md`

### Steps

1. In `docs/frontend/conventions.md`, in the **Entity `⋯`** bullet, state that album / artist / folder menus (list, grid, tree, headers) include **Play all** immediately under **Add all to playlist**; Play all replaces the session playlist and starts the first track; the page Add all pill and track **Add to playlist** stay append-only. Downloads hosts still pass catalog-only collect (now add and play).
2. In `docs/systems/playback.md`, next to the Forget paragraph, state that Play all forgets only ids that leave the queue and prepares the new set with `replace: true`, and that it always starts index 0 at 0 (resume slot cleared). Loading a saved playlist remains a non-forgetting, non-autoplay replace.

### Verify

Read the two edited paragraphs against the menu ids in `albumMenuItems.ts` / `artistMenuItems.ts` / `folderMenuItems.ts` and against `replaceQueue` / `playAllTracks`. Confirm they do not claim a page pill or a track twin.

## Acceptance

- Conventions name the three builders, the item order, and the append-only exceptions.
- Playback docs name forget-leavers, prepare `replace: true`, and start-at-0.
- This plan directory is not referenced as living documentation.
