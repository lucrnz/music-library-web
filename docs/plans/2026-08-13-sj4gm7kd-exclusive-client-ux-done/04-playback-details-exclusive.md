# Stage 04: Playback details exclusive rows

## Status
done

## Description

When exclusive is **enabled**, Playback details (mobile modal / desktop popover) include exclusive output rows and profile tech from the **exclusive-formats** catalog — not browser `/api/codecs`.

## Rationale

The status face stays glanceable; deep dive holds nerd detail (device, FLAC tag, rate/depth) without cluttering the bar.

## Implementation

### Catalog

- Resolve profile meta for exclusive tags from **`exclusiveAudio.formats`** (and/or merge into the builder catalog when exclusive enabled). Do **not** rely on `settings.options` alone — exclusive tags are often absent from `/api/codecs`.
- Prefer catalog `sample_rate` / `bit_depth` / `label`; avoid ad-hoc tag parsing unless catalog miss.

### Rows when exclusive enabled

- **Output** — `Exclusive` (or “Exclusive (companion)”)
- **Device** — live name if set, else preference name if set, else setup hint
- **Profile** — exclusive tag or catalog label (`player.playProfileId` when playing)
- **Bit depth** / **Sample rate** when known from catalog
- Optional light role hint only if useful (`Controlled elsewhere`) — keep light
- When unavailable / not armed: include **Reason** via play-block message for the specific reason (`exclusive_needs_device`, `exclusive_not_ready`, etc.) plus short setup hint if needed
- Do **not** present primary Source as bare “Streaming” as the main exclusive story; exclusive Output row is the delivery mode

### When exclusive off

- Rows unchanged from today (Streaming / Downloaded / codec from browser catalog).

### Wiring

- `buildPlaybackDetailsRows` (or sibling exclusive builder composed into it) accepts exclusive snapshot + exclusive formats + play state.
- `PlaybackStatusLine` / `PlaybackDetailsBody` pass through whatever the builder needs.

### Delete / replace

- Details that only look up exclusive tags in browser codec options and show empty profile/rate.
- Duplicated exclusive copy not shared with `statusFace` where the same phrase is needed (device name resolution can be a small shared helper).

### Out of scope

- Changing primary face (stage 03).
- Settings panel (stage 05).
