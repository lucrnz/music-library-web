# Yellow Book playable files

Session-only. This list does **not** change library index eligibility (`scan/formats.py`).

## Playable (closed)

| Kind | Extensions | Notes |
|------|------------|--------|
| MP3 | `.mp3` | Extension only |
| AAC | `.aac`, `.m4a` | `.m4a` only when the file probes as AAC |
| WMA | `.wma` | Extension only |
| ALAC | `.m4a`, `.alac` | `.m4a` only when the file probes as ALAC |
| FLAC | `.flac` | Extension only |

Case-insensitive. `.m4a` uses the same ALAC-vs-AAC probe as `mp4_kind` in `scan/formats.py`. An unreadable or other-codec `.m4a` is hidden.

Everything else is out: Vorbis/Opus (`.ogg` `.oga` `.opus`), WAV/AIFF, APE, WavPack, DSD, `.mp4`, video containers, CUE, playlists.

Hidden / AppleDouble / non-audio names (`.DS_Store`, `._*`, images, executables) are omitted from the filesystem pane. Folder-art filenames are still read for queue / now-playing covers.

## Sort (per folder)

1. Files whose tags include a track number: `disc` (missing disc = 0), then `track`, then filename.
2. Files with no track number: filename, after the numbered group.

Used for display order and for Add all / Play all / auto-add.

## Filesystem file label

`%title% - %artist% [%album%]`

- No title → filename stem
- No artist → drop ` - artist`
- No album → drop ` [album]`
- Before tags land → filename

Folders always show the directory name.

## Icons

- File (list / grid / tree leaf): shipped VA thumb at `/static/img/va-artist-thumb.webp` (copy of `src/musicweb/images/assets/va-artist-thumb.webp`). Do not call `artistImageUrl` / `VA_ARTIST_ID`.
- Folder: existing `#i-folder` (`<Icon name="folder" />`). No folder art in this pane.
- Queue / now-playing / Media Session cover: companion `/cdrom/cover` (embedded, else `FOLDER_COVER_NAMES` in the file’s directory), else the shipped VA thumb. Never fall back to `audio-cd.svg` for a data row.

## LossyMark

Set at walk / `.m4a` probe time (do not wait for mutagen):

| Kind | `sourceCodec` | `isLossy` | Mark |
|------|---------------|-----------|------|
| MP3 | `mp3` | true | existing `fmt-mp3` |
| AAC (`.aac` or AAC-in-`.m4a`) | `aac` | true | existing `fmt-aac` |
| WMA | `wma` | true | new `fmt-wma` (text sprite, same 24×24 / 8pt / `currentColor` as MP3/AAC) |
| ALAC | `alac` | false | none |
| FLAC | `flac` | false | none |

Show `LossyMark` on filesystem rows, the CD-local queue, and now-playing. Extend `LossyKind` / `kindForTrack` / `LossyMark` ICONS with `wma`. Do not add `hideLossyMark`. Do not call `sourceFileMedia` for `cdrom:` rows (it still throws on anything but mp3/aac).
