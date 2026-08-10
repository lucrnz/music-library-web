# Documentation Strategy Guide

A system for writing project documentation that stays useful over time. The core idea: document **decisions, boundaries, and intent** — not code. Code changes constantly; the reasons behind it change rarely. By keeping docs at the "why" and "where" level and letting source code own the "what exactly," you eliminate the primary cause of doc staleness.

This guide is generic. Any project — regardless of language, framework, or team size — can adopt it.

---

## The two-tier system

Documentation lives in two places with distinct purposes.

### Tier 1: The agent file (root-level instruction file)

A single file at the repository root — `AGENTS.md`, `Claude.md`, or similar — acts as the **entry point for both humans and AI agents**. It is:

- **Short.** Fits on one screen. Bullet points, not paragraphs.
- **Prescriptive.** States hard rules, not explanations. "Use X for Y" rather than "we chose X because..."
- **Linkable.** Points to `docs/` for anything that needs more than a sentence.
- **Machine-readable.** AI coding agents parse this first. Keep it scannable and unambiguous.

The agent file answers: *What do I absolutely need to know before touching this codebase?*

It should contain:

| Section | Purpose |
|---|---|
| **Essentials** | Runtime, package manager, entrypoints, test/lint commands, language rules |
| **Hard rules** | Safety rules, backup procedures, migration workflows — things that cause damage if ignored |
| **Deep dives** | Links to `docs/` pages for architecture, product, contracts, development guides |
| **Documentation scope** | Explicit statement of what docs cover vs. what stays in source |

The agent file should **not** contain explanations, rationale, feature descriptions, or anything that could be expressed as a link to a deeper doc.

### Tier 2: The docs directory

A `docs/` directory holds detailed documentation organized by concern. Each page covers one topic and follows a consistent internal structure (described below). A `docs/README.md` serves as the **documentation map** — a table of contents that also states the documentation philosophy.

---

## What to document (and what not to)

This is the most important decision in the entire strategy. Get this wrong and every doc becomes a liability that drifts from reality.

### Document these things

- **Architecture and system design.** How the system is structured, what each layer is responsible for, how components communicate. These change infrequently and are hard to infer from code alone.
- **Product guidelines and behavioral contracts.** What the product should feel like, what invariants must hold, what users expect. These are invisible in source code.
- **Technical decisions.** The choices that were made (runtime, database, communication protocol, auth model) and any constraints they impose. Decisions outlive the code that implements them.
- **Ownership boundaries.** Which directory/module owns which concern. Where to look for what. Where new code should go.
- **Safe-change workflows.** How to add a migration, a new command, a new feature module. The steps and guardrails, not the exact API.
- **Development operations.** Commands to install, run, test, lint, and deploy. These are essential onboarding surface area.
- **Guardrails.** Hard constraints that prevent damage: security rules, data safety, things you must never do.

### Do NOT document these things

- **Exact schemas, types, or payload shapes.** These live in source and change with every refactor. A doc that says `UserPayload has fields name, email, role` is wrong within a month.
- **Command registries or handler wiring.** The source file that defines commands *is* the registry. Duplicating it creates two sources of truth.
- **Table columns or database field lists.** The schema file is the source of truth. Docs should describe what the tables *represent* and what invariants they enforce, not list columns.
- **Function signatures or API surfaces.** Code is self-documenting at this level. Docs should explain the *design* of the API, not its exact shape.
- **Implementation details that change with every PR.** If it changes weekly, it belongs in code comments at most.

### The litmus test

Before writing a doc, ask: **"Will this sentence still be true after the next five PRs that touch this area?"**

- If yes → document it.
- If no → point to the source file instead.

---

## Document structure

Every doc page in `docs/` should follow a consistent structure. Not every section is required for every page, but the order and naming should be stable.

### Required sections

**Title and overview.** One or two sentences explaining what this page covers and why it matters.

**Source of truth.** Explicit pointers to the actual source files that own the exact details. This is the critical anti-staleness mechanism. Instead of copying code into the doc, you say where the code lives:

```markdown
## Source of truth

- Exact command schemas and names live in `src/shared/commands.ts`.
- Server auth verification lives under `src/web/server`.
- CLI options are exposed through `tool run cli --help`.
```

This section tells the reader: "I'm going to explain the *design* here, but when you need the *exact current implementation*, go to these files." It also tells AI agents exactly where to look.

### Recommended sections

**Architecture / Behavior / Design.** The actual content — how the system works at a conceptual level, what the boundaries are, how data flows, what the expected behavior is.

**Guardrails.** Hard rules that must not be violated. These are the most durable parts of any doc because they encode safety and correctness constraints:

```markdown
## Guardrails

- Never log or commit auth secrets.
- Do not hard-delete user data without explicit consent.
- Keep UI filters aligned with data-layer filters.
```

### Optional sections

- **Adding / extending.** How to add a new instance of the thing (new command, new feature, new job type). Focus on the *workflow*, not the exact code.
- **CLI / Commands.** When the topic has associated developer commands, list them — but include a reminder to verify against the actual tool help.
- **Data safety.** When the topic involves persistent data, include backup instructions or link to them.

---

## Directory organization

Organize `docs/` by the kind of question the reader is trying to answer, not by the code structure. Readers ask "how does auth work?" not "what's in `src/web/server/auth.ts`?"

Recommended top-level categories:

| Directory | Contains |
|---|---|
| `docs/architecture/` | System design, component relationships, technical decisions |
| `docs/product/` | Product guidelines, behavioral contracts, UX principles |
| `docs/development/` | Commands, project structure, style guides, testing strategy, environment setup |
| `docs/contracts/` | Communication protocols, API contracts, schema boundaries |
| `docs/systems/` | Cross-cutting concerns: auth, logging, background jobs, caching |
| `docs/features/` | Feature-specific design docs (only when a feature has non-obvious design decisions) |
| `docs/database/` | Schema philosophy, migration workflows, troubleshooting |
| `docs/frontend/` | Frontend conventions, component patterns, state management |

Not every project needs all of these. Start with `architecture/`, `development/`, and `product/`. Add others as the project grows.

---

## The documentation map

`docs/README.md` is the single entry point to all documentation. It serves three purposes:

1. **States the philosophy.** Opens with what docs are *for* — the kinds of questions they answer and the explicit boundary between docs and source.
2. **Lists every doc.** Organized by category with one-line descriptions. This is the table of contents.
3. **States upkeep rules.** Ends with explicit instructions for when and how to update docs.

The philosophy section should be short and direct:

```markdown
## Documentation philosophy

Docs help a developer or agent answer:

- What is this part of the system responsible for?
- Where should I look in source for the exact implementation?
- What boundaries and invariants must I preserve?
- How do I change it safely?

Do not copy exact schemas, payload shapes, table columns, or handler
wiring into docs. Those details drift quickly and belong in source.
```

---

## Linking strategy

The two tiers connect through deliberate linking.

### Agent file → docs

The agent file's "deep dives" section links to the most important docs pages. These links are curated — not every doc needs a link from the agent file, only the ones that an agent or new developer needs for initial orientation:

```markdown
## Deep dives
- [Documentation map](docs/README.md)
- [Project structure](docs/development/project-structure.md)
- [Architecture](docs/architecture/index.md)
- [Product guidelines](docs/product/core-guidelines.md)
```

### Docs → source

Every doc page links to source files through its "Source of truth" section. These are **directional pointers**, not copies. The link says "go here for the exact details" rather than reproducing those details.

### Docs → docs

The documentation map (`docs/README.md`) links to all pages. Individual docs can cross-reference each other when topics are related, but prefer linking to the map rather than creating a dense web of inter-doc links.

### What is never linked

Docs never contain deep links to specific lines of code, specific function names, or specific type definitions. These are too fragile. Instead, point to the **file or directory** that owns the concern.

---

## The commands exception

Developer commands (install, run, test, lint, migrate, deploy) are the **one area where docs intentionally duplicate information that exists elsewhere** (in `package.json`, `Makefile`, `pyproject.toml`, etc.). This is justified because:

- Commands are the primary onboarding surface area.
- New developers and AI agents need them immediately.
- Scattered across config files, they are hard to discover.

However, command docs should include a standing caveat:

```markdown
Verify exact scripts in `package.json` and CLI options with `tool --help`.
```

This acknowledges that the doc is a convenience copy, not the source of truth.

---

## Anti-staleness mechanisms

The entire strategy is designed around preventing staleness. Here is a summary of every mechanism:

1. **Document intent, not implementation.** "The auth system uses token-based sessions with server-side expiry" stays true across refactors. "The `AuthService.verify()` method takes a `TokenPayload` and returns `AuthResult`" does not.

2. **Source-of-truth sections.** Every doc explicitly names the files that own exact details. When the doc reader needs precision, they go to source. The doc never competes with source.

3. **No schema/type/payload copying.** The most common cause of stale docs is duplicated type definitions. By banning this, you remove the largest class of staleness.

4. **Guardrails are durable.** Security rules, data safety rules, and architectural constraints rarely change. They are the most documentation-worthy content precisely because they are stable.

5. **Upkeep rules are explicit.** Both the documentation map and the architecture index end with concrete instructions for when to update docs. This makes doc maintenance a visible responsibility rather than an afterthought.

6. **Agent file is the forcing function.** Because AI agents read the agent file on every interaction, stale links or incorrect rules surface quickly as agents follow outdated instructions. The agent file's prominence creates natural pressure to keep it current.

---

## Upkeep rules

Include these at the bottom of your documentation map and architecture index:

- Update docs when responsibilities, workflows, safety rules, or source-of-truth file locations change.
- Do **not** update docs when only code internals change (new fields, renamed functions, refactored modules) — that is the domain of source code.
- When you move a source file that a doc points to, update the doc's source-of-truth section.
- When you add a new system or major feature, add a doc page and list it in the documentation map.
- When you remove a system or feature, remove its doc page and its map entry.
- Prefer updating an existing doc over creating a new one. A smaller number of comprehensive pages beats a large number of narrow ones.

---

## Bootstrapping for a new project

To adopt this strategy from scratch:

1. **Create `AGENTS.md`** (or your preferred agent file name) at the repo root. Fill in essentials, hard rules, and a link to `docs/README.md`.
2. **Create `docs/README.md`.** State the philosophy. You can start with an empty table of contents.
3. **Write `docs/development/commands.md`.** List install, run, and test commands. This is the highest-value first doc.
4. **Write `docs/development/project-structure.md`.** Explain the repo layout and what each top-level directory owns.
5. **Write one architecture doc.** Pick the most confusing or non-obvious part of your system and document its design, source-of-truth pointers, and guardrails.
6. **Write product guidelines** if your project has user-facing behavior that should be consistent. This is where product decisions get locked in.
7. **Grow organically.** Add docs when a decision or design is worth preserving. Do not pre-create empty categories.

---

## Checklist for writing a new doc

When adding a page to `docs/`:

- [ ] Does it document decisions, boundaries, or intent rather than exact code?
- [ ] Does it have a "Source of truth" section pointing to the owning source files?
- [ ] Does it have a "Guardrails" section if there are hard constraints?
- [ ] Will its content survive the next several PRs without edits?
- [ ] Is it listed in `docs/README.md`?
- [ ] Is it linked from the agent file if it covers a core topic?
- [ ] Does it avoid copying schemas, types, payloads, or column definitions?

---

## Summary

| Principle | Practice |
|---|---|
| Source code owns exact details | Docs point to source files, never copy from them |
| Docs own decisions and intent | Architecture, product guidelines, boundaries, guardrails |
| Two-tier structure | Agent file (concise rules + links) → docs directory (detailed pages) |
| Consistent page structure | Overview → Source of truth → Design → Guardrails |
| Organized by question, not code | `architecture/`, `product/`, `systems/`, `development/`, etc. |
| Commands are the exception | Documented for onboarding, but marked as convenience copies |
| Staleness is prevented by design | No copied code, durable content only, explicit upkeep rules |
| Docs grow with the project | Start small, add pages when decisions are worth preserving |
