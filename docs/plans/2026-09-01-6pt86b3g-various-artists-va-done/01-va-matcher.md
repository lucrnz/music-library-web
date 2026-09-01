# Stage 01: VA name matcher

## Status
done

## Description

Add a pure VA matcher next to name identity: fold rules, closed alias set, canonical display `Various Artists`, and the well-known `VA_ARTIST_ID`. No scan, HTTP, or radio behavior changes.

## Rationale

Every later stage needs one function and one id. Putting fold + aliases in a tested module keeps remount, search, fetch-skip, and the picker from each inventing a slightly different “is this VA?”.

## Invariants

- `VA_DISPLAY_NAME` is exactly `Various Artists`.
- `VA_ARTIST_ID == artist_id_for(normalize_name("Various Artists"))` and is stable across processes.
- `is_va_name` is whole-field after the fold in [context/va-aliases.md](context/va-aliases.md). `Various Production` is false. `V.A.`, `V/A`, `VA`, `V A`, `Artistes Variés`, and `ヴァリアス・アーティスト` are true.
- `normalize_name` / `display_name` / `sort_name` behavior for non-VA strings does not change.

## Risks

- Accent folding that is too aggressive could collapse a real artist onto an alias (whole-field membership still required).
- Middle-dot and punct-to-space vs punct-delete forms must both be tested or Japanese / `V.A.` cases slip.

## Implementation

### Files

- `src/musicweb/db/va.py`
- `tests/db/test_va.py`
- `tests/db/test_names.py`

### Steps

1. Add `src/musicweb/db/va.py` with `VA_DISPLAY_NAME`, `VA_ARTIST_ID`, `fold_va_keys(value) -> frozenset[str]` (the two punct treatments + mark strip), `is_va_name(value) -> bool`, and `canonical_artist_display(value, fallback) -> str` (returns `VA_DISPLAY_NAME` when `is_va_name`, else existing `display_name`).
2. Encode the closed alias inventory from [context/va-aliases.md](context/va-aliases.md) as a frozenset of already-folded keys inside `va.py`. Do not read that markdown at runtime.
3. Add `tests/db/test_va.py`: table-driven true cases (each operator example and each extra), false cases (`Various Production`, `Unknown Artist`, `Soundtrack`, empty, `None`), both punct forms for `V.A.` / `V/A` / `V A`, accent pair `Artistes Variés` / `Artistes Varies`, Japanese middle-dot vs concatenated, and `VA_ARTIST_ID` stability.
4. In `tests/db/test_names.py`, add one assertion that `normalize_name("Various Artists")` is unchanged (`various artists`) so the well-known id cannot drift if someone “improves” normalize.

### Verify

- `uv run pytest tests/db/test_va.py tests/db/test_names.py`
- `rg -n "is_va_name|VA_ARTIST_ID" src/musicweb` shows only `db/va.py` in this stage.

## Acceptance

- Matcher tests cover every alias family in `context/va-aliases.md` and the documented false cases.
- `VA_ARTIST_ID` matches `artist_id_for(normalize_name("Various Artists"))`.
- No scan, route, or radio file changes in this stage.
