# Stage 07: Lossy marks on every title

## Status
pending

## Description

Add MP3, AAC, and generic-lossy sprites and a shared `LossyMark` next to every album and track title. Hover and `aria-label` use the settled sentence; icon tap shows that sentence as a toast and does not play.

## Rationale

Indexing lossy without a mark would make the library look lossless. One component plus three sprites keeps the honesty rule from forking per surface.

## Invariants

- Copy is exactly: `Lossy source — played as stored. Not a lossless file.`
- Track kind: `mp3` or `aac` from `sourceCodec`. Unknown lossy → generic icon (should not happen for this format set).
- Album kind: `album.lossyKind` (`mp3` | `aac` | `mixed`). NULL / missing → no mark.
- Surfaces: library list/grid (album cards, album rows, track rows), tree (album + track nodes), search, queue, now-playing expanded title, mini-player title, downloads browse, folder `FileRow` when the file has a track.
- Icon tap: `stopPropagation`, `preventDefault`, `showToast` with the sentence. Does not `playIndex`, expand now-playing, or open the album.
- Desktop hover: native `title` (and/or a CSS tooltip) with the same sentence. No long-press gesture.
- `aria-label` on the control is the same sentence.
- Lossless titles have no mark and no extra tap target.
- Sprites are 24×24 `currentColor` fills, same language as `#i-source-*`.

## Risks

- Putting the icon inside the mini-player expand `<button class="mini-meta">` without stopping the click will expand now-playing instead of toasting. Same for queue row click → play.
- Tree group titles and album cards need the album kind, not a guess from the first track.
- Offline downloads must still mark (catalog fields from stage 06). If a catalog row is missing `isLossy`, show no mark rather than a false generic.
- A decorative `<svg>` without a button role is invisible to assistive tech and not a tap target. The mark is a `<button type="button">` (or equivalent) with the aria-label.

## Implementation

### Files

- Change `src/musicweb/templates/index.html` (`#i-fmt-mp3`, `#i-fmt-aac`, `#i-fmt-lossy`)
- Create `src/musicweb/static/js/components/lossy/LossyMark.js`
- Create `src/musicweb/static/js/lossyKind.js` (track/album → `mp3` | `aac` | `mixed` | null + the copy constant)
- Change `src/musicweb/static/js/components/library/rows/TrackRow.js`
- Change `src/musicweb/static/js/components/library/rows/AlbumCard.js`
- Change `src/musicweb/static/js/components/library/rows/AlbumListRow.js`
- Change `src/musicweb/static/js/components/library/rows/FileRow.js`
- Change `src/musicweb/static/js/components/playlist/PlaylistView.js`
- Change `src/musicweb/static/js/components/player/PlayerBar.js` and `NowPlayingFull.js` (title slot / adjacent mark)
- Change tree title rendering (`TreeView.js` and/or `albumsSource.js` / `artistsSource.js` / `downloadsSource.js` / `foldersSource.js`) so album and track nodes carry `lossyKind` and the mark is rendered
- Change search results if they do not reuse `TrackRow` / `AlbumListRow`
- Change `src/musicweb/static/css/` (row/card/player title) so the icon sits on the title line, does not wrap alone, and has a ≥44px hit target on the button without blowing up the row
- Change `docs/frontend/conventions.md` only if a new UI rule is needed (icon-tap toast; no long-press). Prefer a single sentence under UX conventions.

### Steps

1. Draw three simple filled glyphs (letterforms or a compact badge) that read at 16–20px in `currentColor`. Do not introduce a new icon color.
2. `LOSSY_SOURCE_COPY` exported from `lossyKind.js`. `kindForTrack(track)`, `kindForAlbum(album)`.
3. `LossyMark`: if `kind` is null, render nothing. Else button + `Icon` + `title` + `aria-label` + click toast.
4. Place the mark immediately after the visible title text on each surface (same flex row as `.row-title` / `.media-card-title` / `.np-title`).
5. Exclude `.lossy-mark` from row-click handlers the same way `.row-add` / `.row-menu` are excluded.
6. Playback details already has the sentence from stage 05; do not duplicate a second mark-only details path.

### Verify

- `uv run musicweb`, desktop (≥900px) and mobile (<900px):
  - All-MP3 album: MP3 icon on the album (grid, list, tree, search) and on each track (list, queue, folder, downloads).
  - All-AAC album: AAC icon on both.
  - Mixed album (lossy + lossless, or MP3 + AAC): generic icon on the album; per-track MP3/AAC; lossless tracks unmarked.
  - Hover (desktop) shows the exact sentence. Tap icon (mobile and desktop) toasts the same sentence and does **not** play, expand, or navigate.
  - Mini-player and expanded now-playing show the track icon next to the title.
  - Offline downloads list still shows the mark.
  - A lossless-only album has no icon anywhere.

## Acceptance

- [ ] Three sprites + one `LossyMark`. No per-surface SVG copies.
- [ ] Every settled title surface shows the correct kind; lossless stays unmarked.
- [ ] Hover, aria, toast, and Playback details share the exact sentence.
- [ ] Icon activation never starts playback or navigation.
- [ ] Desktop and mobile layouts both keep the mark on the title line.
