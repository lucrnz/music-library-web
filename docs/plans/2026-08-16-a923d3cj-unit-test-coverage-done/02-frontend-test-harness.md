# Stage 02: Frontend test harness

## Status
done

## Description

Split Vitest into two projects (node + existing Chromium smoke), move the Icon test under `tests/browser/`, and add a node `localStorage` stub. No new product assertions beyond the existing Icon smoke still passing.

## Rationale

Every later frontend stage needs a node environment that is fast and has storage. Changing include paths after tests exist would force a second move.

## Invariants

- `pnpm --dir frontend test` runs **both** projects and remains the only documented frontend test command.
- Browser project stays Playwright Chromium headless, Icon only.
- No coverage reporter, no happy-dom/jsdom, no `@vue/test-utils`.
- `@/` imports keep working in both projects.

## Risks

- Vitest 4 `projects` + `mergeConfig` can drop the Vite alias if `extends` is omitted. Confirm `@/` resolves in a tiny node sanity test.
- `tsconfig.app.json` already includes `tests/**/*.ts`; nested files should typecheck. If `setup-node.ts` trips `vue-tsc` (DOM lib vs node), keep the stub typed against `Storage` or a minimal interface and do not add `@types` beyond what is pinned.

## Implementation

### Files

- Edit: `frontend/vitest.config.ts`
- Create: `frontend/tests/setup-node.ts`
- Move: `frontend/tests/icon.smoke.test.ts` → `frontend/tests/browser/icon.smoke.test.ts`
- Create: `frontend/tests/harness/localStorage.stub.test.ts` (node project sanity)

### Steps

1. Rewrite `frontend/vitest.config.ts` to `test.projects`:
   - **node:** `name: "node"`, `environment: "node"`, `include: ["tests/**/*.test.ts"]`, `exclude: ["tests/browser/**"]`, `setupFiles: ["tests/setup-node.ts"]`, `extends: true`.
   - **browser:** `name: "browser"`, `include: ["tests/browser/**/*.test.ts"]`, today’s `browser: { enabled, provider: playwright(), headless, instances: [{ browser: "chromium" }] }`, `extends: true`.
   - Do not add a `coverage` key.
2. `setup-node.ts`: install `globalThis.localStorage` and `globalThis.sessionStorage` as Map-backed objects implementing `getItem`, `setItem`, `removeItem`, `clear`, `key`, `length`. Reset **both** storages in `beforeEach` (`clear()`). Do not leave reset to individual tests.
3. `git mv` the Icon smoke into `tests/browser/`. Keep the same assertions.
4. Add `tests/harness/localStorage.stub.test.ts`: `setItem` / `getItem` / `removeItem` round-trip. This proves the node project is collected.

### Verify

```sh
pnpm --dir frontend test
pnpm --dir frontend typecheck
```

- Output shows both projects (node + browser) and the Icon assertion still passes.
- `rg "coverage" frontend/vitest.config.ts frontend/package.json` has no coverage reporter.

## Acceptance

- [ ] Dual projects configured; `pnpm --dir frontend test` runs both.
- [ ] Icon smoke lives under `tests/browser/` and still asserts `#i-play`.
- [ ] Node setup provides `localStorage` / `sessionStorage` without happy-dom and clears both in `beforeEach`.
- [ ] No coverage tooling added.
