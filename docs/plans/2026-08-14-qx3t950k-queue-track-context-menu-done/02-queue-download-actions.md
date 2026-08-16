# Stage 02: Queue download actions

## Status
done

## Description

Extract a kind-only download join and `confirmRemoveDownloadedTrack`. Point `DownloadIcon` at the kind (it keeps its own title map). Add the queue menu’s download item from the same kind; specialize `ready` as **Remove download** with icon `download-check`.

## Rationale

Per-track download is the other originally requested verb and the first `run()` that must stack with `confirmDialog`. Extracting the **kind** and the confirm prevents a forked state machine and a second copy of the manager’s confirm strings. Copy stays with each caller — icon titles and menu labels are not the same vocabulary.

## Invariants

- Queue-bar **Download** and saved-playlist download icons are unchanged.
- `DownloadIcon` user-visible behavior is unchanged: `ready` stays disabled “Downloaded” (it does **not** grow Remove download).
- `downloadTrack` remains the only user-facing enqueue (quota confirm stays in `downloads/ui.js`).
- Remove-from-device goes through the new `confirmRemoveDownloadedTrack` from **both** the Downloads manager and the queue menu.
- Menu still closes before `confirmDialog` (picker already closes, then `run()`).
- Remove from queue is still last, still `trash` + danger.

## Risks

- Putting menu labels or `check` into the shared join leaks DownloadIcon vocabulary. Kind only; callers own glyph/disabled/copy.
- Mapping queue `ready` to `trash` collides with Remove from queue. Use `download-check`.
- Showing Download for `isMissing` / no `id` / `!downloads.enabled` violates hide-N/A.

## Implementation

### Files

- Create `src/musicweb/static/js/downloads/actionKind.js` (or equivalent next to `catalog.js` — kind join only, no menu/icon copy)
- Change `src/musicweb/static/js/downloads/ui.js` (`confirmRemoveDownloadedTrack`)
- Change `src/musicweb/static/js/components/downloads/DownloadIcon.js` (kind → existing titles)
- Change `src/musicweb/static/js/components/downloads/DownloadsModal.js` (call the confirm helper; do not keep a private copy of the strings)
- Change `src/musicweb/static/js/components/playlist/queueMenuItems.js`
- Change `src/musicweb/static/js/components/playlist/PlaylistView.js` only if the builder needs extra imports at the call site — prefer the builder reading stores itself

### Steps

1. Kind join: given `trackDownloadState` (and enabled / missing / no-id gates), return `{ kind: "hide" | "download" | "busy" | "retry" | "ready" }` **only**. No icon, disabled, label, or title in this module.
   - hide: downloads off, no id, or `isMissing`
   - `none` / `other` → `download`
   - pending|active|paused → `busy`
   - failed → `retry`
   - ready → `ready`
2. `DownloadIcon` maps **kind** → its existing titles **and** glyphs/disabled (Queued / Downloading… / paused / failed-tap-to-retry / other-quality / Downloaded; `ready` stays `check` + disabled). That map is the icon’s copy, not a second state machine over raw queue+catalog fields.
3. `confirmRemoveDownloadedTrack(trackId)` in `ui.js`: existing manager copy (`title: "Remove download"`, `message: "Remove this download from this device?"`, `confirmLabel: "Remove"`, `danger: true`) then `removeDownloadedTrack` if confirmed. Return whether it ran. `DownloadsModal` track-delete path calls this.
4. Queue builder: if `kind === "hide"`, omit. Else insert **above** Remove, mapping kind → menu copy/`run`:
   - `download` / `retry` → one item, labels “Download” / “Retry download”, icon `download`, `run` → `downloadTrack(track)` (toast on throw). Same `run` for both.
   - `busy` → “Downloading…”, disabled.
   - `ready` → `{ label: "Remove download", icon: "download-check", run → confirmRemoveDownloadedTrack(track.id) }`.
5. Builder reads `downloads.enabled`, `downloads.queue`, `settings.download`, `catalogIndex.byTrack` (same reactive sources as `DownloadIcon`) so labels stay live **for the opened slot**. Mismatch still closes (stage 01).
6. Do not add Go to… items yet.

### Verify

- `uv run --group dev pytest`
- `uv run musicweb` with downloads enabled and a mixed queue:
  - Library `DownloadIcon`: ready still disabled “Downloaded”; other/retry/busy unchanged.
  - Downloads manager: remove-track still confirms with the same copy and still deletes.
  - Queue, not downloaded → **Download** enqueues; quota confirm appears only after the menu is gone.
  - Queue, ready → **Remove download** with `download-check` → confirm → gone; cancel leaves it. No second `trash`.
  - In-flight → **Downloading…** visible, not activatable, menu stays open on click.
  - Failed → **Retry download** re-enqueues (same `run` as Download).
  - Different stored quality → **Download**, not Remove.
  - Downloads disabled, or missing track: no download row; Remove still present.
  - Whole-queue Download pill unchanged.

## Acceptance

- [ ] Kind join returns `{ kind }` only — no icon, disabled, or copy.
- [ ] `DownloadIcon` maps kind → its existing titles, glyphs, and disabled. It does not re-join queue+catalog itself.
- [ ] One remove-download confirm; manager and menu both call it.
- [ ] Queue `ready` is Remove download / `download-check`, not disabled “Downloaded” and not `trash`.
- [ ] `download` and retry share one `run` (`downloadTrack`).
- [ ] Hide when the action cannot apply; busy is visible + disabled.
- [ ] Menu is closed before quota and remove-download confirms. Cancel does not reopen the menu.
- [ ] Remove from queue still last and still danger.
