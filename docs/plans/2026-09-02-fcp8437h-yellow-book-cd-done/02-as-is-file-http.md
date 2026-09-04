# Stage 02: As-is file HTTP

## Status
done

## Description

Serve jailed Yellow Book file bytes from the companion over token-gated HTTP with Range, using the same loopback + query-token rules as `/cdda/` and `/files/`.

## Rationale

mpv already `load`s companion HTTP URLs. This is the as-is path: original bytes, no transcode, no WAV wrap.

## Invariants

- Device id and `rel` are query arguments, never URL path segments.
- Call `_require_file_token` (same helper as `/files/` and `/cdda/`). Wrong or missing token is **401**. Jail miss, missing file, stub port, wrong device, or non-allowlist is **404**.
- `GET`/`HEAD` support `Range` the same way `/files/` does. STATUS / access logs must not print `token=`.
- The response `Content-Type` is a best-effort audio MIME from the extension; the body is the file as stored.

## Risks

- Serving outside the volume jail is a local-file leak on 127.0.0.1.
- Large FLAC/DSD Range handlers that slurp the whole file will stall the companion.

## Implementation

### Files

- `src/musicweb/exclusive/app.py`
- `src/musicweb/exclusive/optical_session.py`
- `tests/exclusive/test_cdrom_http.py`

### Steps

1. On `OpticalSession`, add `resolve_cdrom_file(device_id, rel) -> Path | None` that uses the cached index + `jail_join`.
2. In `src/musicweb/exclusive/app.py`, add `GET|HEAD /cdrom/file`. Call `_require_file_token`. Read `device` and `rel` from the query. Stream with Range; do not slurp. Mirror `/files/` header shape (`Accept-Ranges`, `Content-Range`). Do not invent a 404-on-bad-token cousin.
3. Add `tests/exclusive/test_cdrom_http.py`: happy Range, HEAD, bad token **401**, missing device 404, `rel=../etc/passwd` 404, non-allowlisted extension 404, stub port 404.

### Verify

- `uv run pytest tests/exclusive/test_cdrom_http.py tests/exclusive/test_optical_fs.py`
- `rg -n "cdrom/file" src/musicweb/exclusive/app.py` shows query `device` / `rel` / `token`, no path-segment file name.

## Acceptance

- A jailed allowlisted file returns 200/206 with the original bytes.
- Escape, missing file, and stub platform are 404. Wrong token is 401.
- No transcode / remux / WAV wrapper on this route.
