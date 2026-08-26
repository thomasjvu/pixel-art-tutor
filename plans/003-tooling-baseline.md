# Plan 003: Tooling baseline — typecheck script, CI, and AGENTS.md

> **Executor instructions**: Follow this plan step by step. Run every verification
> command and confirm the expected result before moving on. Touch only the files
> listed as in scope. If any STOP condition occurs, stop and report. Do not
> improvise. Commit per the git workflow section. SKIP any instruction to update
> `plans/README.md` — your reviewer maintains the index.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: plans/001-git-init.md
- **Category**: dx
- **Planned at**: no VCS at planning time; base = plan 001's initial commit

## Why this matters

There is no one-command way to know the codebase works: `tsc -b` only runs inside
`npm run build`, there is no CI, and a fresh contributor (or executor agent) must
reverse-engineer commands and conventions. This repo's whole premise is human-agent
collaboration — an `AGENTS.md` is on-brand and materially reduces bad agent edits.
Tests are explicitly deferred by the maintainer, so CI gates on lint + typecheck +
build.

## Current state

- `package.json` scripts (lines 6-11):
  ```json
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "lint": "oxlint",
    "preview": "vite preview"
  },
  ```
- No `.github/` directory exists. No `AGENTS.md`/`CLAUDE.md` exists.
- Toolchain: Vite 8, TypeScript ~6.0 (`tsc -b` with project references:
  `tsconfig.json` → `tsconfig.app.json` + `tsconfig.node.json`), oxlint 1.x.
- Architecture map (for AGENTS.md): `src/engine/` = pure pixel/color/critique logic
  (no DOM, no store imports); `src/store/` = zustand stores (`projectStore` is the
  single source of truth for project data; `editorStore`/`uiStore` are UI state);
  `src/webmcp/registerTools.ts` = the 16 agent tools (single file by design — it is
  the app's showcase); `src/components/` = React UI. Settled conventions: tools
  return `{ok:false, error}` objects instead of throwing; pixel data is ASCII rows
  of base-36 palette indices for agent token economy; project persists to
  localStorage key `pixel-art-tutor.project.v1`; undo history is in-memory only;
  tool registrations are tied to an AbortController so React unmount unregisters.

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Typecheck (after this plan) | `npm run typecheck` | exit 0, no output |
| Lint | `npm run lint` | exit 0 |
| Build | `npm run build` | exit 0 |

## Scope

**In scope**:
- `package.json` (add `typecheck` script)
- `.github/workflows/ci.yml` (create)
- `AGENTS.md` (create)

**Out of scope**:
- Adding a test runner or tests (maintainer deferred tests).
- Enabling `strict` TypeScript (separate plan 009).
- Any file under `src/`.

## Git workflow

- Branch: `advisor/003-tooling-baseline`, branched on the approved head.
- One commit: `chore: add typecheck script, CI workflow, and AGENTS.md`.

## Steps

### Step 1: Add the typecheck script

In `package.json`, inside `scripts`, add `"typecheck": "tsc -b",` (keep existing
scripts unchanged; place it after `build`).

**Verify**: `npm run typecheck` → exit 0, no output.

### Step 2: Create the CI workflow

Create `.github/workflows/ci.yml`:

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:

jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 24
          cache: npm
      - run: npm ci
      - run: npm run lint
      - run: npm run typecheck
      - run: npm run build
```

**Verify**: `npx yaml-lint .github/workflows/ci.yml 2>/dev/null || node -e "console.log('yaml check skipped')"`,
then `npm run lint && npm run typecheck && npm run build` locally → all exit 0
(CI runs exactly these).

### Step 3: Write AGENTS.md

Create `AGENTS.md` at the repo root with these sections (concise; ~60 lines):

1. **What this is** — one paragraph: WebMCP pixel-art studio; humans and AI agents
   co-edit one canvas; agent surface = 16 tools in `src/webmcp/registerTools.ts`
   plus 1 declarative form tool in `src/components/SpritesPanel.tsx`.
2. **Commands** — table: `npm run dev` (Vite dev server), `npm run lint` (oxlint),
   `npm run typecheck` (`tsc -b`), `npm run build` (typecheck + vite build).
   "Run lint + typecheck + build before declaring any change done."
3. **Architecture map** — the layer rules from Current state above, plus: UI
   components must mutate project data only through `useStore` actions (never by
   editing `project` state directly); agent tools must go through the same store
   actions so edits are undoable and visible.
4. **Settled decisions (do not relitigate in drive-by edits)** — the conventions
   list from Current state above, verbatim.
5. **Gotchas** — `document.modelContext` may be undefined (browsers without
   WebMCP); tool registration is aborted on React unmount (StrictMode remounts are
   expected and handled); localStorage hydration must stay defensive (see plan
   004's validator once it lands).

**Verify**: `ls AGENTS.md` exists; `grep -c "npm run" AGENTS.md` ≥ 4.

## Test plan

None — maintainer deferred tests. The CI workflow itself becomes the baseline.

## Done criteria

- [ ] `npm run typecheck` exits 0
- [ ] `.github/workflows/ci.yml` exists and mentions lint, typecheck, build
- [ ] `AGENTS.md` exists with commands + architecture + settled decisions
- [ ] `git diff --stat` shows only `package.json`, `.github/workflows/ci.yml`,
      `AGENTS.md`

## STOP conditions

- `npm ci` is not possible locally (no lockfile) — report; CI would fail.
- Adding the script breaks npm (malformed JSON) and a second careful edit doesn't
  fix it.

## Maintenance notes

- When tests are introduced later, add a `test` job to `ci.yml` and a `test`
  script; keep lint/typecheck jobs as-is.
- Keep `AGENTS.md` updated whenever a settled decision changes — it is the guardrail
  for future executor agents.
