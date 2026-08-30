# Stage 01: Query-shaped CDDA URL

## Status
done

## Description

Replace `/cdda/{device_id}/{track_no}` with `GET|HEAD /cdda/{track_no}?device=…&token=…` so a Mac BSD node like `/dev/rdisk2` reaches the reader. Redact `?token=` from companion STATUS `url` and from mpv log lines.

## Rationale

Uvicorn unquotes `%2F` before Starlette matches. Real SuperDrive ids never hit the current route. CI only used slash-free ids. Without this stage the rest of the plan cannot make sound on a Mac PWA.

## Invariants

- Token gate on `/cdda` stays the same HMAC as `/files/`.
- `device` is required. Unknown / disallowed device still 404s through the existing open-gate.
- STATUS and logs never include the raw query token.
- Windows/Linux stub still 404s the WAV.

## Risks

- mpv must pass the query string through unchanged. Load the full `url.href` from `cdTrackUrl`; do not rebuild the path on the companion.
- Old `/cdda/rdisk2/1` tests must move or they hide a regression.

## Implementation

### Files

- `src/musicweb/exclusive/app.py`
- `src/musicweb/exclusive/mpv_player.py`
- `frontend/src/playback/cdDelivery.ts`
- `frontend/tests/playback/cdDelivery.test.ts`
- `tests/exclusive/test_blob_http.py`
- `tests/test_exclusive_hub_release.py`

### Steps

1. In `app.py`, route `GET`/`HEAD` `/cdda/{track_no}` and read `device` from the query (same token helper as `/files/`). Pass that device string to `hub.open_cdda_track`. Delete the `{device_id}/{track_no}` route.
2. `cdTrackUrl` builds `http://127.0.0.1:{port}/cdda/{trackNo}` and sets `device` + `token` search params. Keep the `cd_not_ready` rejects.
3. `mpv_player.py` `status_snapshot` stores/returns the load URL with the `token` query key stripped. When logging mpv stderr, drop or redact lines that contain `token=`.
4. Tests: `cdTrackUrl` with `/dev/rdisk2` keeps the slash inside the `device` query and the pathname `/cdda/3`. ASGI GET `/cdda/1?device=/dev/rdisk2&token=secret` reaches the fake port (200/206). GET `/cdda/dev/rdisk2/1` is 404. STATUS `url` has no `token=`.

### Verify

```sh
pnpm --dir frontend exec vitest run tests/playback/cdDelivery.test.ts
uv run --group dev pytest tests/exclusive/test_blob_http.py tests/test_exclusive_hub_release.py
```

## Acceptance

- A URL built for `/dev/rdisk2` is loadable by the companion route and opens that device’s reader.
- Slash-in-path `/cdda/dev/rdisk2/1` no longer matches.
- Companion STATUS and the new tests do not leak `token=`.
