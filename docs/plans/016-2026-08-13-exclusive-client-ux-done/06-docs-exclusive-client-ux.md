# Stage 06: Docs for exclusive client UX

## Status
done

## Description

**Replace** (do not merely append) client arming / status language in `docs/systems/exclusive-audio.md` so it matches preference vs live, ensure-then-play, manual first pick, and the exclusive primary face.

## Rationale

Operators and future changes must not re-conflate localStorage preference with companion hog target, or reintroduce false Armed semantics. Living docs currently teach preference-shaped “device selected” arming — that section must be rewritten.

## Implementation

### Update `docs/systems/exclusive-audio.md`

- **Preference vs live:** `selectedDeviceId` (localStorage) vs companion `selected_device_id` / client `companionDeviceId`.
- **Armed** = exclusive enabled ∧ connected ∧ controller ∧ **live** device accepted (not preference alone).
- Client **`syncPreferredDevice`**: re-`set_device` when controller + preference and live missing/mismatch (`hello_ok`, devices update, user pick, ensure-before-play).
- **Ensure-before-play:** `ensurePreferredDevice` (~1.5s); player does not spin its own wait loop.
- First device pick is **manual**; **no auto-pick**; needs_device → toast + open Settings (no focus scroll required).
- Mid-play live loss → exclusive hard-stop; preferred device gone from list → clear preference + persist + hard-stop if playing.
- **Now-playing:** while exclusive enabled, primary face is always exclusive (`Needs device` / `Connecting…` / `Companion offline` / rejected / `Controlled elsewhere` / `Ready · {device}`); details hold tag, rate, depth, device.
- Play-block reasons: `exclusive_needs_device`, `exclusive_not_ready`, `exclusive_readonly`, plus existing failed/no_format.
- Source remains SoT for protocol and exact code names; docs state **client UX intent** only.

### Delete / replace in docs

- Any definition of Armed as “device selected” from preference / localStorage alone.
- “Armed — ready to play” style wording that ignores live hub target.
- Contradictory paragraphs left alongside the new model (rewrite the Arming section cleanly).

### Out of scope

- No companion CLI changes.
- No drive-by AGENTS.md / playback.md rewrites unless a single cross-link is needed for exclusive-audio.
