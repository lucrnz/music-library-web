**Archive.** Decisions in this file were current as of 2026-09-01 (the plan date in the directory name). They may be outdated. Do not treat this as living documentation. This plan directory is an archive.

# Various Artists (VA) collapse

## Goal

Treat every compilation whose album artist is a VA alias as one library artist named **Various Artists**. Docs call this **VA**. Performers who only appear on VA albums stay out of the Artists UI and have no artist page; their tracks stay in Search. Household radio picks by **performing artist**, so a studio cut and a VA appearance share one urn and one ban key.

## Settled decisions

- **Detection** is whole-field album artist (today’s fallback remains `albumartist or artist`). No iTunes `TCMP` / compilation flag. No mixed-artist folder inference.
- **Matching** folds NFKC, casefold, punctuation and middle dots, whitespace, and accents. The entire field must equal a listed alias. `Various` matches; `Various Production` does not. `V.A.` / `V/A` / `VA` / `V A` all match.
- **Closed alias set** is the operator list plus all extras named in [va-aliases.md](va-aliases.md), plus punctuation/accent/middle-dot orthography of those same phrases.
- **One artist on disk.** Display is always `Various Artists`. Identity is the existing uuid5 of `normalize_name("Various Artists")`. Original tag strings are discarded. Sort under V.
- **Same-title compilations merge.** Album identity stays `(album artist id, title_norm)`. Two `Greatest Hits` comps become one album.
- **Any `run_scan` remounts in SQL** (startup quick included). Do not wait for file mtimes or a full scan. No Alembic data rewrite. Regen-only jobs do not remount.
- **Track artist that is itself a VA alias** is rewritten to Various Artists. The VA id is **never** an artist-ban key, so badly tagged comps can contribute many tracks.
- **Feat. / `A / B` strings stay opaque.** No multi-credit split.
- **Artists UI** lists album owners with `album_count > 0` (unchanged filter). VA is one card. VA-only performers are not cards.
- **GET `/api/artists/{id}` and `/albums` for that id 404** when the artist owns zero albums (every album-less artist, not only VA-only guests).
- **Search.** Tracks stay in FTS. The artists bucket matches the alias matcher so `VA` / `オムニバス` / `Artistes Variés` resolve to the one Various Artists card.
- **No appears-on page.** Bon Jovi’s artist page is only albums he owns. VA comps live under Various Artists.
- **Go to artist** is offered only when the track’s performing artist is browsable (`album_count > 0`).
- **Radio graph** is keyed by performing `artist_id`. Each distinct track artist is one urn, including VA-only guests. That urn’s albums are: albums they own, plus each VA album they appear on as a **subalbum** (only their tracks on that compilation). Various Artists is never a lottery urn.
- **Artist ban** is derived from the existing track-id banlist window (in-progress batch + the same batch retention/loosening as today). After a pick, that track’s `artist_id` cannot be picked again in the window. VA’s id is never banned.
- **Drop `RADIO_MAX_PER_ARTIST`.** The performing-artist ban makes the old 2-per-album-artist cap unreachable. Loosening is: drop oldest ban batches, then allow a short batch.
- **VA portrait** is the operator-supplied Aero CD + blue note (see Design). Never local `artist.jpg`, never remote providers, never preferred upload. Photo menu and drop-to-crop are hidden. Regen skips VA.
- **Cover-flip** on a VA album flips to that Aero note (not the generic gray placeholder).

## Design

**Term:** **VA** means the single canonical compilation artist. A **VA album** is an album whose album artist is that id. A **VA-only performer** is a track artist who appears on VA albums and owns no albums.

**Matcher.** A dedicated module (not a column) folds a name and tests membership in the alias set. Two folded forms are tried: punctuation deleted, and punctuation replaced by space. A hit on either form counts. `VA_ARTIST_ID = artist_id_for(normalize_name("Various Artists"))` is the well-known id. No `is_va` schema flag.

**Scan write path.** `ensure_artist` canonicalizes before hashing: a VA alias becomes display `Various Artists` and `VA_ARTIST_ID`. Both album artist and track artist go through that. CD identify already calls `ensure_artist` for the release artist, so a VA disc mounts under the same id.

**Remount.** After `mark_missing` and before `recount_entities` on every `run_scan`, rewrite existing rows whose album-artist or track-artist name still matches the alias list. Re-key albums onto `VA_ARTIST_ID` (new `album_id_for` when the owner changes). Move or merge `covers/albums/{id}.{full,thumb}.webp`. Point tracks at the survivor album; rewrite `album_artist_name` / `artist_name` when those strings were aliases; FTS-upsert touched tracks. Delete alias `artists` rows that have no remaining FKs. Do not delete `covers/artists-preferred/` for those old ids (sacred). Scanned portraits for deleted alias ids may be removed.

**Discovery.** List/search artists stay `album_count > 0`. Search artists also return VA when the query folds to an alias, even if it does not `ILIKE` `Various Artists`. Track payloads grow `artist_browsable` (performing artist owns albums). Client `Go to artist` keys off that flag. Direct `/artists/{id}` for an album-less id is a not-found library page, not “No albums for this artist.”

**Radio.** `EligibleRow` / `CatalogTrack` carry `artist_id` as well as `album_artist_id`. The picker graph is `performer_id → album_id → tracks`. For a VA album (`album_artist_id == VA_ARTIST_ID`), each track is filed under its performing `artist_id`, and that album appears in that performer’s album set as a subalbum containing only their tracks. Non-VA albums are filed under the performing artist as well (studio album + guest-on-someone-else’s-album both use `track.artist_id`). Uniform random remains performer → album → track. Exclude set = track-id ban ∪ in-batch ids ∪ skip ids ∪ tracks whose `artist_id` is already represented in the effective banlist or the in-progress batch (except `VA_ARTIST_ID`). Banlist storage stays batches of track ids; no new radio FK.

**Portrait.** Package full (1000) + thumb (200) WebP built from [the supplied Aero CD + note](https://i.pinimg.com/736x/60/d2/e4/60d2e4be2a6814af3b5591ca512870aa.jpg) (736×736 JPEG). `GET /api/artist-image` short-circuits for `VA_ARTIST_ID` and returns those bytes. `POST`/`DELETE` preferred for that id are 403. Fetch/`needs_fetch` skip VA even under `--force`. `artist_dict` includes `is_va` so the client can hide the photo menu and treat cover-flip as allowed without `has_image`.

## Stage map

Stage 01 is the matcher and well-known id — every later stage imports it.

Stage 02 depends on 01. It is the index change: canonicalize on write, remount existing rows on any scan, re-key album covers. Discovery and radio are meaningless until the graph has one VA owner.

Stage 03 depends on 02. It is the library UI contract: 404 album-less artists, search aliases, `artist_browsable` / `is_va`, Go to artist, artist-page not-found.

Stage 04 depends on 02 (and uses 01). It rewrites the picker graph and ban derivation. Independent of 03’s HTTP flags except that both consume remounted rows.

Stage 05 depends on 01 and 03 (`is_va` on the artist payload). It ships the Aero asset, image-route short-circuit, fetch/preferred skip, photo-menu hide, and cover-flip.

Stage 06 depends on 03–05 so living docs describe the behavior that actually landed. Durable decisions move to `docs/systems/`, `docs/frontend/`, `docs/product/`, `docs/database/`, and `docs/architecture/` — not this plan directory.

## Out of scope

- Inferring compilations from mixed track artists or iTunes `TCMP`
- Multi-artist tag split (`feat.`, `&`, `/`)
- An appears-on / featured discography page
- Changing album identity (year or folder in the key)
- Weighting the radio lottery by album or track count
- Alembic data migration
- Changing CD identify to give unripped stubs per-track artist ids (release artist still goes through `ensure_artist`)
- Remote/local/preferred portraits for VA
- Soundtrack / OST as VA
- iOS / Safari / Firefox clients

## Assumptions

- None of the extras in [va-aliases.md](va-aliases.md) collide with a real act the operator cares about after whole-field matching.
- Orphan preferred files under old alias artist ids may remain on disk; scan must not delete that directory’s files.
- Frontend artists list remains a single `limit=500` request; one extra VA card does not change paging.
- Radio persist shape (track-id batches, no FK) is unchanged.
- The Pinterest JPEG is the operator-chosen VA avatar; the implementation commits encoded WebP, not a runtime fetch of that URL.
