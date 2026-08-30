**Archive.** Decisions in this file were current as of 2026-08-30 (the plan date in the directory name). They may be outdated. Do not treat this as living documentation. This plan directory is an archive.

# Gate CD entry chrome until enabled and a drive is picked

## Goal

On an installed Mac PWA, do not offer CD as a session you can enter until Settings **Enable CD playback** is on **and** an optical drive is picked. The desktop Queue CD icon and the mobile CD tab stay off the screen until then. Turning that condition off while already in a CD session leaves the deck.

## Settled decisions

- **Hide predicate.** Entry chrome is shown only when `canShowCdUi() && cd.enabled && !!cd.selectedDriveId`. Platform-incapable clients already hide via `canShowCdUi()`. Drive missing (stored id, not in the current list) still counts as a picked drive. Companion offline, no disc, and not-an-audio-CD stay in-room faces.
- **Which chrome.** Hide the desktop Queue-header CD session toggle and the narrow-window CD tab. Settings → CD playback stays on `canShowCdUi()` so the operator can enable and pick a drive. In-session Leave on `CdNowPlaying` / `CdMini` is unchanged; those surfaces only exist while session is `cd`.
- **Disable or unpick while live.** `setCdEnabled(false)` or `setCdSelectedDriveId(null)` while `activeSession() === "cd"` leaves via `become("none")` (stop transport, stop watch, restore the queue pane). Disabling still keeps the last drive pick.
- **`/cd` and desktop absorb.** Same predicate as the icon/tab. If the route is `/cd` and the predicate is false, replace to the last library URL and do not `enterCdMode`. This includes becoming false while already on `/cd`.
- **Store refuses entry.** `enterCdMode` does not become `cd` or open the rail when the predicate is false. `toggleCdSession` still leaves if session is already `cd`.
- **`canShowCdUi()` stays platform-only.** Do not teach `capability.ts` about prefs. The composed predicate lives on `stores/cd.ts`.
- **Living docs.** After the code, `docs/systems/cd-playback.md` and the CD sentence in `docs/frontend/conventions.md` state the extra gate. This `design.md` is not living documentation.

## Design

Today the Queue CD icon and the mobile CD tab key only on `canShowCdUi()`. A capable Mac PWA therefore always shows a face/room toggle. First press enters CD and the room face is `needs_setting` until Enable + drive exist. That is the opposite of “do not put CD on screen until it is actually set up.”

```text
canShowCdUi()          = installed Mac PWA (or loopback dev unlock)
cd.enabled             = Settings “Enable CD playback”
cd.selectedDriveId     = last picked optical id (kept across disable)

cdEntryAllowed()       = all three

entry chrome           = desktop Queue/CD-list header icon + mobile CD tab
Settings CD panel      = canShowCdUi() only
/cd and desktop absorb = bounce unless cdEntryAllowed()
setCdEnabled(false)    = persist off, keep drive, leave if session is cd
setCdSelectedDriveId(null) = leave if session is cd
```

Drive rematch and “Drive missing” do not clear `selectedDriveId`, so a vanished SuperDrive does not hide the toggle. First-run Enable with no pick yet does hide it.

`cdEntryAllowed()` is a function over live prefs, not a new persisted flag.

## Stage map

1. **Store predicate and leave/refuse** — chrome cannot tell the truth until the store owns the predicate, leaves on disable/unpick, and refuses `enterCdMode`. Tests live here because no App mount suite exists.
2. **Wire icon, tab, and `/cd`** — depends on the exported predicate and the leave/refuse behavior from 01. Settings panel is left on `canShowCdUi()`.
3. **Living docs** — after the shipped gate exists, so `cd-playback.md` / `conventions.md` do not describe a toggle that always appears on a Mac PWA.

## Out of scope

- Changing the Mac-PWA platform gate or `canShowCdUi()`
- Hiding the Settings CD playback panel
- Hiding entry chrome for companion offline, drive missing, no disc, or not-an-audio-CD
- New App.vue / TabBar / PlaylistView mount tests
- Windows / Linux optical implementation, ripping, household restream

## Assumptions

- `hydrate()` already reads `musicweb.cd.enabled` and `musicweb.cd.driveId` before first paint, so the first render can hide the icon without a flash-of-chrome helper.
- Production already registers `onLeaveCd(() => leaveCdMode())` in `main.ts`, so `become("none")` from the setters is the same leave path as the desktop toggle.
- Radio-style App absorb has no component mount test; store tests plus typecheck are the automated bar for this plan.
