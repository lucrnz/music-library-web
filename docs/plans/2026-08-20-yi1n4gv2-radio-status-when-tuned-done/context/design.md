**Archive.** Decisions in this file were current as of 2026-08-20 (the plan date in the directory name). They may be outdated. Do not treat this as living documentation. This plan directory is an archive.

# Radio stream details only when tuned

## Goal

On the Radio tab, the now-playing stream-details badge appears only while the listener is tuned in. When they are not, the badge is gone and the extras row stays put.

## Settled decisions

- **Tuned only.** Mount `PlaybackStatusLine` (the `Streaming · …` badge and the Playback details popover it opens) only while `radio.chrome === "tuned"`. Hide it for `preview`, `stopped`, and `tuning`.
- **Reserve an empty slot.** When the badge is hidden on the room surface, keep a same-height hole so volume, lyrics, and settings do not jump on Tune in / Tune out.
- **Empty slot.** No “Tuning in…” and no other substitute copy in that hole. Preview, stopped, and tuning look the same: empty reserved wrap. The disabled Tune-out button already covers the in-between.
- **Room only.** Desktop compact radio and mobile `RadioMini` stay badge-less and do not grow a reserved slot. On-demand now-playing is unchanged.
- Living system docs record the gate. No new ADR.

## Design

`RadioNowPlaying` room today passes `:show-status="!compact"` whenever the station face is `current`. Opening `/radio` does not auto Tune in, so the codec line (`playSource: "streaming"` + tuner profile, or lossy source fields) shows for a preview listener who is not receiving audio. After Tune out the stopped face keeps the same badge. That is the product bug.

`NowPlayingView` already gates the line with `showStatus` (`v-if` on `PlaybackStatusLine`). Compact radio already passes false. The room must pass `showStatus` from `chrome === "tuned"` instead of `!compact`.

Collapsing the line would move `.player-extras`. The room also passes `reserveStatus` so that when `showStatus` is false the view still mounts an empty `.np-status-wrap` — the same class `PlaybackStatusLine` uses as its root. Compact and on-demand leave `reserveStatus` false (default) and keep today’s no-slot collapse.

`.np-status-wrap` is currently `min-height: 20px`. The badge button is padding `4px 8px` + `12px` / `line-height: 1.3` (about `24px`). The empty wrap must use that used height so the hole matches the badge. The status text is `nowrap` + ellipsis, so the wrap does not grow to two lines.

`NowPlayingView` still does not import `radio.ts` or `player.ts`. `PlaybackStatusLine` stays injectable; do not add `playSource: "radio"`. Exclusive snap on radio stays the disabled stub. Unmounting the line on Tune out drops any open details popover the same way today’s `showStatus` `v-if` does.

## Stage map

1. **Gate and reserve** — the product change. Bind the room `showStatus` to `tuned`, teach `NowPlayingView` to keep the wrap, and align wrap height. Compact, mini, and on-demand stay as they are.
2. **Living docs** — after the chrome exists, `radio.md` and `playback.md` describe the tuned gate and the reserved hole instead of an always-injected codec line.

## Out of scope

- Exclusive-mode radio
- A second status string (“Tuning in…” or similar) in the reserved slot
- Desktop compact radio or mobile `RadioMini` chrome
- On-demand `PlaybackStatusLine` rules
- A Vue component test runner (no happy-dom / TestClient)

## Assumptions

- A `~24px` empty wrap on the room is acceptable for preview and stopped; it is the same space the badge occupies today.
- Bumping `.np-status-wrap` `min-height` does not change on-demand expanded layout, because that wrap already sizes to the button.
- Project tests do not cover Vue chrome; verification is typecheck plus exercising `/radio` in the browser.
