# Stage 04: companion() dynamic-import helper

## Status
done

## Description

Replace the five identical `import("../exclusive/companionClient.js").then(...).catch(() => {})` sites in `exclusiveAudio.js` with one file-local `companion(fn)`.

## Rationale

`commitHogToken` and empty-token disconnect added a fifth copy of the same loader. The functions stay separate; only the import dance is shared.

## Invariants

- `setHogToken` still persists on every keystroke, disconnects immediately when the trimmed token is empty, and does **not** `sync` on non-empty input.
- `commitHogToken` still only `syncCompanionConnection` (called from the token field `@change`).
- `setExclusiveEnabled` / `setExclusivePort` still persist then sync.
- `setSelectedDeviceId` still persist then `syncPreferredDevice`.
- No new module. No behavior change.

## Risks

- Folding `setHogToken` into `commitHogToken` would sync on every keystroke and undo plan 018. Keep two functions.

## Implementation

### Files

- Change `src/musicweb/static/js/stores/exclusiveAudio.js`

### Steps

1. Add next to the setters:

```js
/** @param {(m: typeof import("../exclusive/companionClient.js")) => unknown} fn */
function companion(fn) {
  import("../exclusive/companionClient.js")
    .then(fn)
    .catch(() => {});
}
```

2. Replace each of the five `import(...).then(...).catch` sites with `companion((m) => m.syncCompanionConnection())`, `companion((m) => m.disconnectCompanion())`, or `companion((m) => m.syncPreferredDevice())` as today.
3. Do not change persist rules or the empty-token branch.

### Verify

- Grep `exclusiveAudio.js`: one `import("../exclusive/companionClient.js")`, inside `companion`.
- `setHogToken` / `commitHogToken` / `setExclusiveEnabled` / `setExclusivePort` / `setSelectedDeviceId` still exist with the same persist + companion call pattern.
- `uv run --group dev pytest`

## Acceptance

- [ ] Single loader helper. Five call sites, two token functions.
- [ ] Empty token still disconnects on input; non-empty still waits for `@change` to sync.
- [ ] No new file.
