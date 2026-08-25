# Stage 08: Play companion files and show policy

## Status
done

## Description

HTML `resolvePlaySource` and exclusive `resolvePlayIntent` honor **When a download exists** against companion file URLs. Downloads quality and that policy stay visible while exclusive is on. Lossy local files go to mpv.

## Rationale

The locker is unused until both sinks play it. Exclusive lossy *stream* already shipped in stage 02; this adds local.

## Invariants

- Companion playable catalog row → loopback `GET /files/{audio key}?token=` (Range). No OPFS blob URL on this backend.
- Exclusive uses the same policy helper as HTML (`shouldPreferLocalOnline` / `resolvePlaySource` shape). Local win → companion URL, `source: "downloaded"`, `sink: "companion"`.
- Lossy + local file → mpv plays that URL. Lossy + no file → stage 02 source stream.
- `shouldHideBrowserQualityControls` hides **Streaming** only, not Downloads quality or **When a download exists**.
- Radio stays HTML `resolvePlaySource` (exclusive radio still TODO). Leftover OPFS on a desktop tab still uses OPFS blob URLs.

## Risks

- Exclusive `source: "downloaded"` must still count listens (`play_source` downloaded, origin queue) — do not special-case companion.
- Token in the audio URL must not be copied into diagnostic logs or toasts.

## Implementation

### Files

- `frontend/src/downloads/resolve.ts`
- `frontend/src/downloads/writer.ts`
- `frontend/src/playback/playIntent.ts`
- `frontend/src/stores/exclusiveAudio.ts`
- `frontend/src/components/settings/SettingsModal.vue`
- `frontend/tests/downloads/resolve.test.ts`
- `frontend/tests/playback/playIntent.test.ts`

### Steps

1. In `frontend/src/downloads/writer.ts`, change `getLocalAudioUrlForRecord` so the companion backend returns `fileUrl(audio key)` from `companionBlob` instead of `readBinary` + `createObjectURL`.
2. In `frontend/src/downloads/resolve.ts`, keep policy logic; it already uses `getLocalAudioUrlForRecord`. Add/adjust node tests in `frontend/tests/downloads/resolve.test.ts` for “downloaded” when the record is playable (mock `getLocalAudioUrlForRecord`).
3. In `frontend/src/playback/playIntent.ts` `exclusiveIntent`: if downloads are enabled, call `resolvePlaySource` with the same policy/offline flags as HTML (exclusive is not radio). If that result is `downloaded`, return `sink: "companion"` with that url/profile. If streaming/unavailable, keep stage 02 exclusive tag / source-stream behavior. Lossy + downloaded must not hit `exclusive_lossy`.
4. In `frontend/src/stores/exclusiveAudio.ts`, change `shouldHideBrowserQualityControls` so Settings can hide only Streaming. Either split the helper (`hideStreamQualityControls` vs hide-all) or add `shouldHideDownloadPolicyControls()` that returns false. Prefer one named helper for Streaming-only.
5. In `frontend/src/components/settings/SettingsModal.vue`, keep the Streaming select behind the exclusive hide; always show Downloads quality (when downloads enabled) and **When a download exists**. Drop the “while exclusive is on, streams use…” copy that claims policy is gone.
6. Extend `frontend/tests/playback/playIntent.test.ts`: exclusive + enabled downloads + mocked `resolvePlaySource` downloaded → companion + downloaded + that url; exclusive + lossy + downloaded → same, not `exclusive_lossy`.

### Verify

```sh
pnpm --dir frontend test -- frontend/tests/downloads/resolve.test.ts frontend/tests/playback/playIntent.test.ts
pnpm --dir frontend typecheck
```

## Acceptance

- Exclusive + prefer-downloaded + ready catalog row loads the loopback file URL into mpv (`source: "downloaded"`).
- Exclusive + prefer-stream + online still uses the exclusive FLAC tag (lossy: `source` stream).
- Settings with exclusive on still shows Downloads quality and **When a download exists**; Streaming stays exclusive-hidden.
- Radio is unchanged (HTML resolve only).
