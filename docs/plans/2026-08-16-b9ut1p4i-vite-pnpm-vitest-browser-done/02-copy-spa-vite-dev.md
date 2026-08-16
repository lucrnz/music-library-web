# Stage 02: Copy the SPA and run it under Vite-dev

## Status
done

## Description

Copy the existing JS/CSS/images into `frontend/`, replace the stub with a real Vite `index.html` (sprite + valid config/theme defaults + relative CSS/JS), and skip SW registration in DEV on the **copy** only. After this stage, browse `http://localhost:5173/` against a running FastAPI API. `http://localhost:8765/` still serves the no-bundler SPA.

## Rationale

The app has to run through Vite before we cut FastAPI over or write a component test. A directory-preserving **copy** keeps every relative `./foo.js` import valid and leaves the operator entrypoint (`uv run musicweb`) working.

## Invariants

- No `.vue` files. No import-path rewrite inside JS except `frontend/js/pwa.js` (DEV skip).
- `src/musicweb/static/{js,css,img}`, `src/musicweb/static/js/pwa.js`, `templates/index.html`, `vendor_deps.py`, and `sw.template.js` stay in place and keep serving `:8765`.
- `/static/img/placeholder.svg` and `/static/img/icon-*.png` URL strings in JS stay those strings.
- `from "vue"` / `from "vue-router"` stay bare specifiers.
- No `transformIndexHtml` plugin. No `__THEME_COLOR__` / `__MUSICWEB_CONFIG__` tokens.

## Risks

- Two copies of the SPA until stage 04. Edits during this window must land in **both** trees, or only in `frontend/` if stage 04 follows immediately. Do not invent a sync script.
- Default Vite proxy can stall ranged `/api/stream`. `timeout: 0` is set in stage 01; this stage must verify a **Range GET** from `:5173` (expect 206), not HEAD.
- `:5173` and `:8765` are different origins. A leftover SW on `:8765` cannot control Vite-dev. Do not add unregister choreography.

## Implementation

### Files

- Copy `src/musicweb/static/js/` → `frontend/js/` (overwrite the stub `main.js`)
- Copy `src/musicweb/static/css/` → `frontend/css/`
- Copy `src/musicweb/static/img/` → `frontend/public/static/img/` (include existing `icon-*.png`; do not generate files)
- Replace `frontend/index.html` with the Vite shell (content from `src/musicweb/templates/index.html`, adapted)
- Change `frontend/js/pwa.js` only (DEV skip)
- Do not change `src/musicweb/templates/index.html`, `src/musicweb/static/js/pwa.js`, or `frontend/vite.config.js` except if the stage 01 proxy object is missing `timeout: 0`

### Steps

1. Copy the three trees (`cp -a` / `git add` the new files). History on the old tree stays until stage 04 deletes it.
2. Rewrite `frontend/index.html` from the Jinja template:
   - `<title>Music Library</title>`
   - `<meta name="theme-color" content="#121212" />` (literal)
   - `<script type="application/json" id="musicweb-config">{"publicOrigin":""}</script>` (valid JSON, no spaces inside the object so FastAPI can replace the exact body in stage 04)
   - CSS: `href="./css/app.css"` and the other five files — relative, so Vite emits hashed `/assets/*.css`
   - Favicon / apple-touch-icon stay `/static/img/…`
   - Delete the import map
   - Keep the inline SVG sprite
   - `<script type="module" src="./js/main.js"></script>`
   - Keep `rel="manifest" href="/manifest.webmanifest"`
3. In `frontend/js/pwa.js` `doRegister`, if `import.meta.env.DEV` then emit `pwa.sw` `{ result: "skipped_vite_dev" }` and return `null` **before** any `navigator.serviceWorker` work. Leave `src/musicweb/static/js/pwa.js` unchanged.
4. Confirm `frontend/js/util.js` (and other placeholder sites) still say `"/static/img/placeholder.svg"`.

### Verify

- `pnpm --dir frontend build` exits 0.
- `rg "__MUSICWEB_CONFIG__|__THEME_COLOR__|transformIndexHtml" frontend` — no matches.
- `rg "\"publicOrigin\":\"\"" frontend/index.html frontend/dist/index.html` — both contain the exact empty-origin JSON body.
- `rg "/static/css/|/static/js/main|importmap" frontend/dist/index.html frontend/index.html` — no old absolute CSS/JS / import map.
- `rg "import.meta.env.DEV" frontend/js/pwa.js` — DEV skip exists.
- `rg "import.meta.env.DEV" src/musicweb/static/js/pwa.js` — no match.
- `rg "from \\"vue\\"|from \\"vue-router\\"" frontend/js/main.js frontend/js/router.js` — still bare specifiers.
- `test -d src/musicweb/static/js` and `test -d src/musicweb/static/css` and `test -d src/musicweb/static/img`.
- `test -f src/musicweb/static/sw.template.js`.
- `uv run musicweb` still serves the old SPA: `curl -sS http://127.0.0.1:8765/` contains `/static/js/main.js` and the import map.
- Manual + HTTP: `uv run musicweb` + `pnpm --dir frontend dev`; `curl -sS http://127.0.0.1:5173/` is the Vite shell (module script under `/`, not `/static/js/main.js`); library chrome renders in the browser; `curl -sS -o /dev/null -w "%{http_code}" http://127.0.0.1:5173/api/health` is `200`. This check needs at least one indexed track. Pick an id from `GET /api/browse` only (not the UI) and:
  ```sh
  curl -sS -D - -o /dev/null -H "Range: bytes=0-1023" \
    "http://127.0.0.1:5173/api/stream?id=<track_id>"
  ```
  Expect **206** and an audio `Content-Type` (HEAD / `curl -I` does not exercise the ranged body; do not use it).

## Acceptance

- [ ] `http://localhost:5173/` shows the real app against FastAPI `/api`, including one ranged `/api/stream` **206** (id from `GET /api/browse`).
- [ ] `http://localhost:8765/` still shows the no-bundler app.
- [ ] Built `dist/index.html` still contains `{"publicOrigin":""}` and `#121212`; no sentinel tokens.
- [ ] Images resolve at `/static/img/…` under Vite-dev (`placeholder.svg` / favicon).
- [ ] SW does not register on `:5173`. `src/musicweb/static/js/pwa.js` is unchanged.
- [ ] No `.vue` files. JS relative imports on the copy unchanged except the DEV skip.
