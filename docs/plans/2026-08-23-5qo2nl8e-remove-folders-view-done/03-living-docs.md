# Stage 03: Living docs

## Status
done

## Description

Record that library browse modes are Artists, Albums, Search, Stats, and Downloads — not filesystem Folders — in the product and frontend pages that name those modes today.

## Rationale

`context/design.md` is not living documentation. Later browse or routing work should not reintroduce a Folders chip from a stale conventions sentence.

## Invariants

- Docs describe what stages 01–02 shipped. Do not invent a `/folders` redirect or a gone page.
- Do not treat this plan directory as the long-term home of the decision.
- Do not rewrite scan “same folder” sibling or `folder.jpg` cover language. Those are not the Folders view.

## Risks

None

## Implementation

### Files

- `docs/product/core-guidelines.md`
- `docs/frontend/conventions.md`
- `docs/development/project-structure.md`
- `README.md`

### Steps

1. In `docs/product/core-guidelines.md`, change the **Browse modes** bullet to Artists → Albums → Tracks, Albums grid, Search, Stats. Do not list Folders.
2. In `docs/frontend/conventions.md`, replace the `/folders` SPA-fallback example with `/artists` (or another remaining client route). In the **Entity `⋯`** bullet, drop folders, folder-files, and `folderMenuItems` so Play all is described on album and artist menus only. In the tracks/albums/artists normalization bullet, drop the sentence that folder and browse-dir leaves keep server `dirs`/`files` names.
3. In `docs/development/project-structure.md`, drop `folders` from the `routes/` row. Change the `resolve` ownership sentence so it no longer says resolve stays for directory browse/collect — resolve stays for path jail / `present_audio`.
4. In `README.md`, drop “folders” from the mobile-first browse blurb.

### Verify

Read the four edited passages against `frontend/src/router.ts`, `frontend/src/components/layout/ModeBar.vue`, `frontend/src/components/library/entityActions.ts`, `src/musicweb/routes/api.py`, and `src/musicweb/library.py`. Confirm they do not mention a Folders browse mode or `/api/browse`.

## Acceptance

- Product browse modes match the shipped ModeBar.
- Conventions and the README do not advertise Folders.
- Project-structure route list matches `routes/api.py`.
- This plan directory is not referenced as living documentation.
