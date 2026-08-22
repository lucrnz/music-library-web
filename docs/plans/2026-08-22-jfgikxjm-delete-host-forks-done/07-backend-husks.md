# Stage 07: Backend husks

## Status
done

## Description

One `provider_json` helper for artist-image HTTP. Radio `serialize` uses `StationSnapshot.position_seconds` without reclamping.

## Rationale

These are the two backend leftovers that are not the job-runner sandwich. Providers stay URL + pick; serialize stops copying clamp math.

## Invariants

- Provider cascade order and soft rate-limit behavior (`429` / `503`, MusicBrainz `rate_limited` continue) do not change.
- Serialize payload shape (`face`, track fields, `position`) does not change. `position_seconds` already clamps to `[0, duration]`.
- Preferred artist images stay isolated from this fetch cascade.

## Risks

- MusicBrainz search vs lookup use different failure mapping today (lookup treats some exceptions as `not_found`). `provider_json` must take the on-error status so that split stays.

## Implementation

### Files

- `src/musicweb/artist_images/providers.py`
- `src/musicweb/routes/radio.py`
- `tests/radio/test_now_playing.py`
- `tests/artist_images/test_pick.py`

### Steps

1. In `src/musicweb/artist_images/providers.py`, add `provider_json(ctx, url, *, user_agent=None, on_error="error")` that wraps `get_json`, maps `429`/`503` to `rate_limited`, non-dict/non-200 to `http_{status}`, and exceptions to `on_error` with a 200-char detail. Replace the four copied try/429/not-dict blocks (MusicBrainz search + lookup, Last.fm, fanart.tv). Leave pick/URL extract in each provider.
2. In `src/musicweb/routes/radio.py` `serialize`, set `body["position"] = snapshot.position_seconds(now) or 0.0`. Delete the second `< 0` / `> duration_s` clamp.
3. Keep `tests/radio/test_now_playing.py` assertions on the same payload. Touch `tests/artist_images/test_pick.py` only if a provider signature used in tests changes.

### Verify

- `uv run pytest tests/radio/test_now_playing.py tests/radio/test_prepare.py tests/artist_images/test_pick.py tests/artist_images/test_resolve.py`
- `rg -n "if pos < 0" src/musicweb/routes/radio.py` is empty
- `rg -n "status in \\(429, 503\\)" src/musicweb/artist_images/providers.py` is empty (the helper owns that)

## Acceptance

- Artist-image providers call `provider_json`. Per-provider code is URL + pick + persist decision.
- `serialize` does not reclamp. `position` still matches `position_seconds` (or `0.0`).
