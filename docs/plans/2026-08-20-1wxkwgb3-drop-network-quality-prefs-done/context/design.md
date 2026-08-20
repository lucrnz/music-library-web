**Archive.** Decisions in this file were current as of 2026-08-20 (the plan date in the directory name). They may be outdated. Do not treat this as living documentation. This plan directory is an archive.

# Drop network-conditioned quality prefs

## Goal

Stop choosing a streaming codec from Network Information API hints, and stop pausing downloads on cellular. Streaming quality is one explicit Settings picker; changing it restarts the current track. Downloads run whenever the server is reachable.

## Settled decisions

- One **Streaming** picker. `getActiveStreamCodec()` returns that setting only. It does not read `connection.type` or Data Saver.
- Keep localStorage key `musicweb.streamCodec` and default `opus_192_48000`. Drop `musicweb.streamCodecCellular` (and in-memory `streamCellular`). Do not copy the old cellular value into the remaining setting.
- Changing the Streaming picker still restarts the now-playing track on the new codec and re-prepares the queue.
- Remove **Only download on Wi‑Fi**. The queue no longer auto-pauses for cellular or Data Saver. Offline and server-unreachable auto-pause stay.
- Drop `musicweb.onlyDownloadOnWifi`. Download *quality* remains its own setting.
- After both features are gone, delete the Network Information module and every settings/downloads listener that existed only to flip stream profile or metered-pause.
- Update living system and product docs. No new ADR.
- Exclusive audio, server profile list, encode policy, and playback policy (prefer local vs stream) are unchanged.

## Design

Today `getActiveStreamCodec()` returns `streamCellular` only when the browser reports `connection.type` and the link is cellular or Data Saver. That path almost never runs (iOS Safari and typical desktop Chromium do not expose a usable `type`), so the Mobile data picker is hidden and the stored cellular tag is unused. Constraint `change` events re-prepare the queue without restarting the current track, and they notify downloads so “only download on Wi‑Fi” can freeze the queue with reason `metered`.

After this plan, Settings shows a single **Streaming** field whenever browser quality controls are visible (exclusive audio still hides that section). The play, prepare, and “prefer higher quality” paths keep calling `getActiveStreamCodec()`; it becomes a thin read of the one persisted tag. State field `streamWifi` is renamed to `streamCodec` so the name matches the product. `setStreamCodec` keeps today’s side effects: persist, close Settings, re-prepare, `playIndex` the current row when the active tag changed.

Downloads queue policy forwards only `autoPauseReason()` from connectivity (`offline` / `server`). The `metered` reason is removed from `DownloadAutoPauseReason` and from `AutoPausedReason` in `downloads/state.ts`. The “Paused — waiting for Wi‑Fi” banner and `downloads.onNetworkConstraintChanged` go away. Jobs already frozen as metered unpause on the next policy apply (boot / connectivity recovery) unless the user paused or the server is unreachable.

`frontend/src/networkConstraints.ts` has no remaining product consumer. Delete it, the settings mirrors `canDetectConnectionType` / `constrained`, `onNetworkConstraintChanged` in settings, and `bindNetworkConstraintEffects`’s `onConstraintChange` subscription. Boot still injects a playlist-tracks getter into settings so `setPlaybackPolicy` can re-prepare without importing the playlist store (that cycle-breaker stays; it just no longer listens for connection-type events).

Reachability (`online` / `offline` / `server_down`, `canUseRemoteMedia`) is a different system and is not part of this change.

## Stage map

1. **Single stream setting** — unhook play/prepare from connection type and collapse the Settings UI to one picker. This is the original request and the only path that chooses a stream tag.
2. **Remove Wi‑Fi-only downloads** — independent product cut, ordered after stage 01 because it is the secondary decision. After this stage, `networkConstraints` is unused by product code.
3. **Delete Network Information plumbing** — depends on 01 and 02; deleting earlier would strand the remaining consumer. Removes the module, tests, and boot listener.
4. **Update living docs** — last so playback, connectivity, downloads, transcoding, exclusive-audio, product guidelines, frontend/architecture maps, README, and testing notes describe the shipped behavior.

## Out of scope

- Server `/api/codecs` catalog, profile tags, and ffmpeg encode settings
- Exclusive-audio profile pick and companion prepare
- Playback policy options (`prefer_better` / `prefer_offline` / `prefer_stream`)
- A manual “I’m on mobile data” switch or any replacement cost-hint UI
- Reachability probes, connectivity toasts, and download pause for offline / server-down
- Changing the default stream tag away from `opus_192_48000`

## Assumptions

- Operators will change Streaming in Settings when they want a cheaper codec on mobile data.
- Stale `musicweb.streamCodecCellular` and `musicweb.onlyDownloadOnWifi` values are safe to drop; they were not the effective prefs on browsers where those features failed to appear.
- After stages 01–02, no **code** consumer of `networkConstraints` remains beyond the settings flags and the constraint-change listener (deleted in stage 03). Living docs still name cost hints until stage 04 (`docs/frontend/conventions.md`, `docs/architecture/index.md`, `docs/README.md`, plus the system pages).
