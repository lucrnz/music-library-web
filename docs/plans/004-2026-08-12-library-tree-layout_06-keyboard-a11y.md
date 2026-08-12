# Stage 06: WAI-ARIA tree keyboard and menu a11y polish

## Status
done

## Description

Wire full WAI-ARIA tree keyboard behavior on the **shared** `TreeView` using the existing **visible-nodes** projection (stage 02). Polish layout menu keyboard to match. Enter/Space: group toggles expand; track/file leaf plays (same as row primary click).

## Rationale

Keyboard was explicit v1 scope. Doing it last avoids rework while adapters stabilize; one handler on the engine means all modes and manager (if focused) inherit behavior without four key maps.

## Implementation

- `role="tree"` / `treeitem"`, `aria-expanded` on groups, depth/set size as practical.
- Roving tabindex; keys: ↑↓ visible order; → expand or into first child; ← collapse or parent; Home/End; Enter/Space activate.
- Async expand: keep focus on group unless → moves into child when already expanded (WAI-ARIA-aligned).
- Consume `flattenVisible` only — do not walk DOM for sibling order as source of truth.
- Layout menu: arrows, Enter select, Escape close, focus return to trigger (align with `QualitySelect`).
- Ignore keys when focus is in search field or modal dialogs.
- Smoke: keyboard-only walk Artists tree to a track and play; change layout via menu keys; Folders/Downloads trees behave the same.

## Out of scope (unchanged)

- Search tree, Queue tree, bulk hierarchy API, pagination beyond 500.
