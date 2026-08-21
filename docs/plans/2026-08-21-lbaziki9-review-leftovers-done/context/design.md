**Archive.** Decisions in this file were current as of 2026-08-21 (the plan date in the directory name). They may be outdated. Do not treat this as living documentation. This plan directory is an archive.

# Delete leftover wrappers; make PlayIntent the load contract

## Goal

Finish the critical-structure implementation so it passes the nuclear-review code bar: delete names that do not own a model, give forget a tagless encode check, and make `PlayIntent` a discriminated union so `loadIntent` is apply + `sink.load`, not a second exclusive/HTML loader.

## Settled decisions

- `prepareTag` is deleted. `prepareTracks` keeps its own exclusive grouping. Do not thread intents into prepare.
- Forget skips via `can_encode(*, is_lossy)` in `passthrough.py` (today: `not is_lossy`). No dummy `DEFAULT_PROFILE_TAG`. Enqueue still uses `stream_intent` with the real request tag.
- Play-intent flatten: discriminated union + one exclusive notice branch (`block` starts with `exclusive`). `intentForTrack` stays in `player.ts` (device gate + codec probe). Do not move that I/O into `playIntent.ts`.
- Do not add `nextRefCount`, `validate_profile_tag`, or any other increment/tag wrapper. In-txn pin is `firstPin = not existing` then `+= 1`.
- Do not add `applyJobOutcome` as a new test export. Inline `try/catch` and delete `applyOutcomeSafely` plus its test.
- `claimRadio` is deleted. `tuneIn` calls `suspendMediaSession()`. `claimOnDemand` stays.
- Unavailable intents have no `sink` and no `url`. Ready intents have `url: string`. No `url!`.
- Four stages: wrappers, `can_encode`, PlayIntent contract, living docs. Not six one-file micro-stages (ceremony) and not one “everything else” stage.
- No new ADR.

## Design

The last plan deleted `playHtml` / `playExclusive` / `plan_stream` / `LibraryScanner` and added a catalog mutex. The follow-up review found the old control flow sitting next to the new names:

- `applyCatalogPins` is increment wearing a suit; the txn calls it with empty `pinArtistIds` then once per artist.
- `applyOutcomeSafely` is `try/catch`. Its test reimplements the fail path in the callback.
- `claimRadio` is `suspendMediaSession`.
- `prepareTag` is written on every intent and never read in production.
- Forget asks `stream_intent(..., codec=DEFAULT_PROFILE_TAG)` so “no cache” means “not encode for opus_192.”
- `loadIntent` still has a five-reason exclusive OR plus `block?.startsWith("exclusive")` two lines later.
- Blocked intents disagree on unused `sink` (`htmlAudio` vs `companion`).

After this plan those names are gone. Catalog pin is two lines in the txn. Outcome failure is a `try/catch` in `applyJobOutcome`. Radio tune-in suspends Media Session directly. Forget calls `can_encode`. `PlayIntent` is `unavailable` (block + message, no url) or ready (`streaming` | `downloaded`, required url). `loadIntent` prefixes the title only when the block is not exclusive; exclusive blocks toast. `tracksToPrepare` loses the dead exclusive early-return (`prepareTracks` already groups by tag on that path).

## Stage map

1. **Delete leftover wrappers** — independent of the PlayIntent type change. Catalog pin, outcome catch, and `claimRadio` are the same defect class (a name that does not own the model). One stage so we do not spend three ships on three aliases. No PlayIntent edits here (those files stay stable for stage 03).
2. **`can_encode`** — independent server change. Do not mix it into 01 (it is a new canonical helper, not a deletion). Forget is the only caller in this plan. Enqueue keeps `stream_intent` with the real tag.
3. **PlayIntent contract** — depends on nothing from 01–02. Discriminated union, drop `prepareTag`, flatten `loadIntent` notice, drop the dead `tracksToPrepare` exclusive return. This is the remaining loader judo.
4. **Living docs** — last so playback / transcoding / radio / conventions describe shipped names (`can_encode`, no `claimRadio`, union PlayIntent).

## Out of scope

- Threading `PlayIntent` into `prepareTracks`
- Moving `intentForTrack` I/O into `playIntent.ts`
- Status-line rewrite / deleting `RADIO_EXCLUSIVE_SNAP`
- Splitting `catalog.ts`
- Job-runner phase table, `Library.present_audio`, `fromApiArtist` / `TrackView`
- Exclusive radio
- Changing `stream_intent` product cases or radio tune-in codec rules
- A `nextRefCount` / `validate_profile_tag` helper

## Assumptions

- `can_encode` staying `not is_lossy` is correct until a product decision allows encode cache for lossy (none planned).
- Node vitest still has no IndexedDB; deleting the pin/outcome unit tests is acceptable. Mutex + in-txn `firstPin` stay covered by construction, not by a fake pin model.
- Radio tests already mock `onDemandControl`; dropping `claimRadio` is a mock-field delete.
- Living docs from the previous plan still mention `claimRadio` and a bag-shaped PlayIntent; stage 04 patches those lines only.
