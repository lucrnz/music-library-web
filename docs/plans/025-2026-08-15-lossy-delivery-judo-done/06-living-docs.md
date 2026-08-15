# Stage 06: Living docs

## Status
done

## Description

Write the durable invariants from stages 01–05 into the project’s normal docs. Do not copy function names, SQL, or file-size notes that will rot.

## Rationale

Scan classify, delivery-tag ownership, exclusive/prepare consequences, album reduce, and strict source media must outlive this plan directory. `design.md` is not living documentation.

## Invariants

- AGENTS.md lossless-first bullet still holds; only add a clause if a hard rule changed (classify-once / no guessed passthrough mime). Keep it one screen.
- Docs state intent and ownership, not argv or column lists.

## Risks

- Over-specifying client function names in `playback.md` recreates the 021 “two one-liners” sentence that this plan revoked. Describe the rule, not the call graph.

## Implementation

### Files

- Change `docs/systems/playback.md`
- Change `docs/systems/library-scan.md`
- Change `docs/systems/transcoding.md`
- Change `docs/systems/downloads.md` if it still says download ext/mime is guessed
- Change `docs/frontend/conventions.md`
- Change `docs/architecture/technical-decisions.md`
- Change `docs/product/core-guidelines.md` only if a product sentence is now wrong
- Change `AGENTS.md` only if a hard rule needs a short clause

### Steps

1. **playback.md:** Client delivery tag is `source` for lossy originals; quality prefs do not apply. Prepare skips those ids (HTML and exclusive). Exclusive profile selection yields no tag; play reason is `exclusive_lossy`. HTML probes mp3/aac families for source delivery; probe miss is `codec_unsupported`; load/network fail is `play_failed`. Point at `lossyKind.js`, `resolve.js`, `playlist.js` prepare helpers, `exclusiveAudio.js`, `player.js` as sources of truth.
2. **library-scan.md:** Walk eligibility classifies a file once (lossless / lossy / not). Unreadable MP4 is not indexed. Album `lossy_kind` is a finalize cache of the same reduce the client uses (`mp3` / `aac` / `lossy` / `mixed`). Do not list the SQL.
3. **transcoding.md:** Passthrough serves original bytes for reserved `source` only; mime/ext are defined for mp3 and aac only. Unknown stored codec is a 400, not an encode.
4. **frontend/conventions.md:** Albums normalize at `fromApiAlbum` like tracks at `fromApiTrack`. `kindForAlbum` does not accept snake_case. Lossy-mark bullet stays.
5. **technical-decisions.md** packed-lossless paragraph: add that unreadable MP4 is not treated as AAC, and that exclusive/prepare follow the `source` delivery tag rather than a second encode path.
6. Do not rewrite README feature bullets unless they claim guessed transcode or “lossy is mixed on tracks.”

### Verify

- Read each touched paragraph: still true after deleting any function name. If a sentence names a helper, it must be under a “source of truth” list, not in the rule itself.
- `rg "two one-liners|also normalizes" docs` — no living-doc leftovers of the 021 resolve double-normalize.
- No new content under `docs/plans/` except this already-written plan.

## Acceptance

- [ ] Living docs match stages 01–05 invariants.
- [ ] Plan 025 `context/design.md` is not linked as current law.
- [ ] AGENTS.md still short; hard rules not contradicted.
