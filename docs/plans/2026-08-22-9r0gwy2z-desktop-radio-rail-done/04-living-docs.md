# Stage 04: Living docs

## Status
done

## Description

Rewrite the desktop radio / tab-bar sentences in the living docs so they match stages 01–03. Do not treat `context/design.md` as the long-term source.

## Rationale

`docs/frontend/conventions.md`, `docs/systems/radio.md`, and `docs/product/core-guidelines.md` still say desktop shows the tab bar and `/radio` replaces both panes. Those sentences would block the next chrome change.

## Invariants

- Source of truth for request shapes, socket, and Tune-in stays the code and `docs/systems/radio.md` client/guardrail sections that this plan does not reopen.
- No ADR. This is a chrome layout change, not a station/delivery change.
- `design.md` is not living documentation.

## Risks

- Updating only conventions and leaving `core-guidelines.md` “Desktop keeps the tab bar” would keep a false product-shape rule.

## Implementation

### Files

- `docs/frontend/conventions.md`
- `docs/systems/radio.md`
- `docs/systems/playback.md`
- `docs/product/core-guidelines.md`

### Steps

1. In `docs/frontend/conventions.md` **UX conventions**, replace the mobile/desktop tab and radio-pane bullets: mobile still has Library | Playlist | Radio and `/radio` unmounts library+playlist; desktop (`min-width: 900px`) **hides** `#tab-bar`; library+playlist stay mounted; radio room is `RadioNowPlaying` in the expanded `#player` rail; Queue header icon toggles that rail; desktop `/radio` opens the rail and replaces to the last library URL. Keep “Do not add Radio as a ModeBar chip” and `effectiveLibraryMode` radio-free. In the Desktop now-playing bullet, say the room is in the rail on desktop and on `/radio` on mobile; compact bar cover opens the rail on desktop and `/radio` on mobile.
2. In `docs/systems/radio.md` **Client**, replace “`/radio` is a third pane… Desktop shows the tab bar; Radio replaces both… `#player` is hidden on `/radio`.” Desktop: chrome state, same rail as expanded now-playing, occupant explicit (`railFace`), persist, Queue toggle, `/radio` rewrite, breakpoint keep-surface, `tabOpen` from App. Mobile paragraph stays a third pane. Compact cover: desktop opens the rail; mobile still navigates to `/radio`. Opening Radio still does not auto Tune in. Do not change station, picker, delivery, or guardrails except any sentence that says desktop `/radio` unmounts the library.
3. In `docs/systems/playback.md`, where the codec line is described as mounting “On `/radio`”, say the radio **room** (mobile `/radio` / desktop rail) instead.
4. In `docs/product/core-guidelines.md` **Mobile-first**, replace “Desktop (≥ ~900px) keeps the tab bar; Library/Playlist restore the dual-pane; Radio replaces both” with: desktop hides the tab bar, dual-pane stays, radio uses the now-playing rail. Keep mobile tabs as written.

### Verify

Read the four pages against [context/design.md](context/design.md): desktop-only, one rail, occupant explicit, Queue icon, `/radio` rewrite, tab bar hidden, no ModeBar chip, mobile unchanged. No code tests.

```sh
rg -n "keeps the tab bar|Radio replaces both|Desktop shows the tab bar" docs/frontend/conventions.md docs/systems/radio.md docs/product/core-guidelines.md
```

That search must print nothing.

## Acceptance

- The four living pages match the settled decisions in [context/design.md](context/design.md).
- No remaining “desktop keeps/shows the tab bar” or “Radio replaces both panes” claims in those files.
- Station/delivery/guardrail rules outside client chrome are unchanged.
