# Stage 03: Optical watch lifetime and hub extract

## Status
done

## Description

Stop cancelling the optical watch (and dropping the CDDA reader) from `release_device`. Move watch / list / read / eject / open-gate off `ExclusiveHub` into `src/musicweb/exclusive/optical_session.py`.

## Rationale

Exclusive-off CD is the speakers path: `syncCompanionConnection` already sends `release_device` while the socket stays up. Tying watch to that message stops media events under a playing WAV. `session.py` is 843 lines and is absorbing optical policy.

## Invariants

- Watch dies on `watch_optical` off, controller TTL/disconnect, and `hub.stop`. Not on `release_device`. Not on `stop`.
- `release_device` still unhogs mpv and clears the selected device. Controller claim stays.
- Optical commands stay controller-only. Readonly still cannot list/watch/eject/open.
- `OpticalPort` stays `list` / `read` / `eject` / `open_track`. Watch is not a port method.
- Hog `load` stays on the hub.

## Risks

- Tests that assumed `release_device` tears down watch must be rewritten; that was the bug.
- Extract can break hub wiring if command dispatch still points at old methods. Keep `COMMANDS` on the hub as thin delegates.

## Implementation

### Files

- `src/musicweb/exclusive/optical_session.py`
- `src/musicweb/exclusive/session.py`
- `src/musicweb/exclusive/app.py`
- `tests/exclusive/test_optical.py`
- `tests/test_exclusive_hub_release.py`
- `tests/test_exclusive_protocol.py`

### Steps

1. Add `OpticalSession` (or equivalent) owned by the hub: watch task, last/allowed device, list/read/eject command bodies, `open_cdda_track` / `drop_cdda_reader`, `cdda_allowed_device`.
2. `_cmd_release_device` does not call `_cancel_optical_watch` or `drop_cdda_reader`.
3. `_cmd_stop` still does not cancel watch.
4. `app.py` `get_cdda` asks the optical session (via the hub) for the reader, not new policy on the hub class.
5. Test: `watch_optical` on, then `release_device`, then a disc signature change still broadcasts and `GET /cdda` on the allowed device still opens. Test: `watch_optical` off still cancels and drops the reader. Test: readonly still rejected.

### Verify

```sh
uv run --group dev pytest tests/exclusive/test_optical.py tests/test_exclusive_hub_release.py tests/test_exclusive_protocol.py
```

## Acceptance

- `release_device` while watch is on leaves the watch and the current reader up.
- `watch_optical` off / controller loss / `hub.stop` still cancel watch and drop the reader.
- Optical command bodies do not live on `ExclusiveHub` beyond thin dispatch.
- Readonly clients still cannot drive the tray.
