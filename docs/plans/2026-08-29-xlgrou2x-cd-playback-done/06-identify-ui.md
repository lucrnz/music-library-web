# Stage 06: Identify UI

## Status
done

## Description

While CD mode is on and the setting is enabled, watch the selected drive, show Detecting, and apply identity per [disc-identity.md](context/disc-identity.md): memory GET, else identify; unique → confirm without picker; several → blocking picker; zero / CD-Text-only → session titles only. Change disc… re-picks.

## Rationale

This is the iTunes moment. Playback (07) should already see titles on the CD cursor.

## Invariants

- Never auto-play.
- Watch only when `cd.enabled` ∧ CD mode ∧ a `selectedDriveId`. Stop watch on leave.
- `POST /identify` is never a write. Unique is a client `POST /confirm`. Dismiss picker = no confirm.
- Remembered GET applies the DTO (real `tracks[].id`) without a picker.
- CD-Text-only / unknown: sentinel ids `cd:unknown:{n}`, generic cover, no confirm.
- Applied rows: DTO `id`, `isMissing: false` on the cursor. Never `replaceQueue`.
- Picker rows show album, artist, year, country, label, track count.

## Risks

- Identify POST while the server is down: stay on CD-Text / Track N, face Detecting then idle, do not leave CD mode.

## Implementation

### Files

- `frontend/src/stores/cd.ts`
- `frontend/src/cd/identify.ts`
- `frontend/src/cd/types.ts`
- `frontend/src/api.ts`
- `frontend/src/exclusive/opticalClient.ts`
- `frontend/src/components/cd/CdNowPlaying.vue`
- `frontend/src/components/cd/CdMatchPicker.vue`
- `frontend/tests/cd/identify.test.ts`
- `frontend/tests/stores/cd.test.ts`

### Steps

1. `frontend/src/cd/types.ts`: TOC, CD-Text, match DTO, applied DTO, room faces including `detecting` and `pick`.
2. `frontend/src/api.ts`: `identifyCd(toc, cdText)`, `confirmCd(discid, releaseMbid, toc)`, `getCdIdentity(discid)`.
3. `frontend/src/cd/identify.ts` (pure): given media + identify response + optional memory DTO, decide `confirm unique` / `open picker` / `apply memory` / `cdtext display` / `unknown`. No fetch inside the decision.
4. `stores/cd.ts`: on `optical_media` present, set Detecting, GET memory then identify. `setCdTracks` writes the **CD** cursor. `present=false` clears the cursor and sets **No disc**.
5. `CdMatchPicker.vue`: blocking overlay in the CD room. Confirm → `POST /api/cd/confirm` then apply DTO. Change disc… on `CdNowPlaying.vue` re-opens (re-identify if needed).
6. Generic cover remains `audio-cd.svg` until an applied DTO has `has_cover` (then `coverUrl` with `album_id`).
7. Tests: unique / several / zero / remembered / CD-Text-only decision table; unique path calls confirm; dismiss does not; sentinels are `cd:unknown:{n}`.

### Verify

```sh
pnpm --dir frontend exec vitest run tests/cd/identify.test.ts tests/stores/cd.test.ts
pnpm --dir frontend typecheck
```

## Acceptance

- Inserting a disc in CD mode fills the CD cursor with Track N immediately, then Detecting, then either names or a picker.
- Unique hit confirms without a picker and cursor rows carry library `id`s.
- Picking a release persists on the server; the next insert of that TOC applies GET and skips the picker.
- Change disc… overwrites the memory.
- A disc with only CD-Text never calls confirm.
- `musicweb.playlist.v1` is unchanged. No playback starts.
