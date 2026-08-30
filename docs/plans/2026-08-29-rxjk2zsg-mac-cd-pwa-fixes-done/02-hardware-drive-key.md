# Stage 02: Hardware drive key and rematch

## Status
done

## Description

Give each optical drive a stable `key` (libcdio hwinfo vendor+model) on `optical_drives`. Persist that key next to the last BSD id. Remap after every list. Do not auto-pick when the key is ambiguous.

## Rationale

`/dev/rdiskN` is a media node. Eject + reinsert often changes N. Settings today stores only the path, so the next disc is Drive missing until a manual re-pick. A hwinfo key is the smallest rematch that does not start a DiskArbitration project.

## Invariants

- `OpticalDrive.id` remains the current BSD path used for watch / `/cdda?device=`.
- Preference is cleared only when the user picks another drive or disables CD.
- Two listed drives with the same key and a vanished last id → keep the key, do not select either, face Drive missing.
- Empty list → keep the key and last id, face Drive missing (libcdio empty-tray gap stays).

## Risks

- hwinfo can be empty; fall back to `id` as the key so rematch still works for a stable path.
- Client hydrate runs before the first list; do not wipe `selectedDriveId` on an empty boot list.

## Implementation

### Files

- `src/musicweb/exclusive/optical.py`
- `src/musicweb/exclusive/optical_cdio.py`
- `frontend/src/stores/cd.ts`
- `frontend/src/exclusive/opticalClient.ts`
- `frontend/src/components/settings/CdPlaybackPanel.vue`
- `frontend/tests/stores/cd.test.ts`
- `tests/exclusive/test_optical.py`

### Steps

1. Add `key: str` on `OpticalDrive` (and `to_dict`). Darwin `list_drives` sets `key` to stripped `vendor|model` from hwinfo, or the path if hwinfo is empty. Stub drives stay `[]`.
2. Persist `musicweb.cd.driveKey` beside `musicweb.cd.driveId`. `setCdSelectedDriveId` writes both from the chosen `CdDrive`.
3. When `optical_drives` arrives, rematch: last id still listed → keep it; else unique listed key match → adopt that id (persist id, keep key); else leave id as stored and let `refreshCdFace` show Drive missing.
4. Settings select options still show `name` (hwinfo or path). Selecting a row sets id+key.
5. Tests: list mock returns `/dev/rdisk3` with the same key as the stored `/dev/rdisk2` → selected id becomes `/dev/rdisk3`. Two rows same key → id unchanged, face Drive missing once capable/enabled. Empty list does not clear the stored key.

### Verify

```sh
uv run --group dev pytest tests/exclusive/test_optical.py
pnpm --dir frontend exec vitest run tests/stores/cd.test.ts
```

## Acceptance

- After a rematch, `watch_optical` / `/cdda?device=` use the new BSD id and the stored key is unchanged.
- Ambiguous or empty lists never silently pick a drive.
- Disabling CD or picking another row is still the only user clear of the preference.
