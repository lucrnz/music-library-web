# VA alias set

Closed list for the matcher in stage 01. Matching is **whole-field** after fold (see `context/design.md`). This file is the plan’s alias inventory; the code frozenset is the runtime source of truth.

## Fold

1. NFKC
2. Casefold
3. Build two candidates: strip punctuation / middle dot (`・` and ASCII punct) to nothing, and replace those characters with a space
4. Collapse whitespace
5. Strip combining marks (so `variés` ≡ `varies`, `künstler` ≡ `kunstler`)

A name is VA if **either** candidate equals a folded alias below.

## Operator list (folded forms)

| Display examples | Folded keys |
|------------------|-------------|
| VA, V.A., V/A, V.A, V. A. | `va`, `v a` |
| Various | `various` |
| Various Artist | `various artist` |
| Various Artists | `various artists` |
| Various Artistes, Artistes Variés | `various artistes` |
| Varios, Vários | `varios` |
| Varios Artistas, Vários Artistas | `varios artistas` |
| Artiste Varies / Artistes Varies / Artistes Variés | `artiste varies`, `artistes varies` |
| Artiste Divers / Artistes Divers | `artiste divers`, `artistes divers` |
| Verschiedene | `verschiedene` |
| Verschiedene Interpreten | `verschiedene interpreten` |
| Multiple Artist / Multiple Artists | `multiple artist`, `multiple artists` |
| Assorted Artist / Assorted Artists | `assorted artist`, `assorted artists` |
| Omnibus | `omnibus` |
| オムニバス | `オムニバス` |
| ヴァリアス | `ヴァリアス` |
| ヴァリアス・アーティスト | `ヴァリアス アーティスト`, `ヴァリアスアーティスト` |
| ヴァリアス・アーティスツ | `ヴァリアス アーティスツ`, `ヴァリアスアーティスツ` |

## Extras (approved)

| Display examples | Folded keys |
|------------------|-------------|
| Artisti Vari / Artisti Varii | `artisti vari`, `artisti varii` |
| Diverse Artiesten | `diverse artiesten` |
| Verschillende Artiesten | `verschillende artiesten` |
| Verschiedene Künstler | `verschiedene kunstler` |
| Blandade Artister | `blandade artister` |
| Eri Esittäjiä | `eri esittajia` |
| Forskjellige Artister | `forskjellige artister` |
| Forskellige Kunstnere | `forskellige kunstnere` |
| Artistas Varios | `artistas varios` |
| Varios Intérpretes | `varios interpretes` |
| 群星 | `群星` |
| 合輯 | `合輯` |
| 合集 | `合集` |
| Разные исполнители | `разные исполнители` |
| Various Artist's | folds to `various artists` via punct strip |
| ヴァリアスアーティスト | already under Japanese keys above |
| オムニバスアルバム | `オムニバスアルバム` |

## Not aliases

- Substrings (`Now That's What I Call Music — Various Artists` as a whole field is not in the set unless the entire field folds to a key)
- `Soundtrack`, `OST`, `Original Soundtrack`
- `Compilation` / `Compilations` as a bare album-artist string
- `Unknown Artist`
