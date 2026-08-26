# Plan 009: Enable strict TypeScript and fix the fallout

> **Executor instructions**: Follow this plan step by step. Run every verification
> command and confirm the expected result before moving on. Touch only the files
> listed as in scope. If any STOP condition occurs, stop and report. Do not
> improvise. Commit per the git workflow section. SKIP any instruction to update
> `plans/README.md` — your reviewer maintains the index.

## Status

- **Priority**: P3
- **Effort**: M (fix fallout)
- **Risk**: MED (type-level fixes can tempt behavior changes — forbidden here)
- **Depends on**: plans/001, 003 (typecheck script); best after 004-008 so those
  refactors don't have to be strict-cleaned twice
- **Category**: tech-debt
- **Planned at**: no VCS at planning time; base = plan 001's initial commit

## Why this matters

`tsconfig.app.json` does not enable `"strict": true` (the Vite react-ts template
ships it; it was lost when the config was rewritten). With strict off, TypeScript
does not vouch for null-safety — precisely the hazard class this app has (indexed
palette/pixel access, `find()` results, optional WebMCP API). The codebase already
*styles* itself as strict-safe; this plan makes the compiler agree. Behavior must
not change: every fix is a type-level fix (guards, non-null rewrites, optional
chaining), verified by the compiler and an unchanged build.

## Current state

- `tsconfig.app.json` `compilerOptions` (relevant excerpt):
  ```json
  "target": "es2023",
  "lib": ["ES2023", "DOM"],
  "module": "esnext",
  "types": ["vite/client", "webmcp-types"],
  "skipLibCheck": true,
  "noEmit": true,
  "jsx": "react-jsx",
  "noUnusedLocals": true,
  "noUnusedParameters": true,
  "erasableSyntaxOnly": true,
  "noFallthroughCasesInSwitch": true
  ```
  No `"strict"` key (note: earlier audit observed strict-like errors under the
  template's default; the current file has no strict flag, so adding it may surface
  anywhere from 0 to dozens of errors — handle whatever appears per the rules below).
- Likely error sites (leads, not guarantees): `projectStore.ts` non-null
  assertions (`next.sprites.find(...)!`), `CanvasStage.tsx` canvas refs,
  `registerTools.ts` indexed access (`tools.find(...)` results), `webmcp-types`
  `document.modelContext` (already optional-typed and guarded).

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Typecheck | `npm run typecheck` (or `npx tsc -b --pretty false`) | exit 0 |
| Lint | `npm run lint` | exit 0 |
| Build | `npm run build` | exit 0 |

## Scope

**In scope**:
- `tsconfig.app.json` (add `"strict": true`)
- Any file under `src/` STRICTLY for type-level fixes (guards, type annotations,
  non-null handling). No logic changes.

**Out of scope**:
- Any behavioral refactor, even if it looks cleaner under strict.
- `tsconfig.node.json` / `tsconfig.json` beyond what compilation demands.
- Disabling strict for individual files (no `@ts-ignore` / `// @ts-expect-error`
  unless a fix is genuinely impossible — and then STOP instead).

## Git workflow

- Branch: `advisor/009-strict-typescript`, branched on the approved head.
- Two commits: `chore: enable strict TypeScript` (config + fixes that are part of
  making it compile) — a single commit is acceptable if fixes are small.

## Steps

### Step 1: Enable strict and inventory the fallout

Add `"strict": true` to `tsconfig.app.json` `compilerOptions`. Run
`npx tsc -b --pretty false 2>&1 | tee /tmp/strict-errors.txt | wc -l`.

**Verify**: you have an error inventory. If the count exceeds ~60 error lines,
STOP and report the inventory instead of fixing (the plan's cost estimate is wrong).

### Step 2: Fix errors type-level only

Rules for fixes, in priority order:
1. Narrow with runtime guards (`if (!x) return;`) where the code already implies
   the value exists.
2. Replace `!` non-null assertions with guards ONLY when the assertion is reachable
   with null; keep `!` where the invariant is structural (e.g. `target.frames[fi]`
   right after a bounds check).
3. Prefer optional chaining + `??` defaults for reads.
4. No `any`, no `@ts-ignore`, no casts that erase checks (`as Project` on unknown
   input is forbidden — that's what plan 004's sanitizer is for).

**Verify**: `npx tsc -b --pretty false` → exit 0.

### Step 3: Gates + behavior audit

`npm run lint && npm run build` → both exit 0. Then `git diff` review: every hunk
must be type-level. If ANY hunk changes runtime logic (a new early return that
wasn't implied by existing checks, a changed default, reordered validation),
revert that hunk and note it in NOTES.

**Verify**: gates exit 0; diff audit clean.

## Test plan

None — maintainer deferred tests; the compiler IS the test here.

## Done criteria

- [ ] `grep -n '"strict": true' tsconfig.app.json` → 1 match
- [ ] `npx tsc -b --pretty false` exits 0
- [ ] `npm run lint` and `npm run build` exit 0
- [ ] `grep -rn "@ts-ignore\|@ts-expect-error\|: any" src/ --include="*.ts" --include="*.tsx"`
      → 0 new matches vs base
- [ ] Diff contains no runtime-logic changes (reviewer will check hunk by hunk)

## STOP conditions

- More than ~60 error lines at Step 1 (report the inventory; the plan gets resliced).
- A fix seems to REQUIRE a behavior change (that's a real bug — report it as a new
  finding instead of fixing it here).
- `webmcp-types` or React type augmentation conflicts that can't be resolved
  without editing `node_modules`.

## Maintenance notes

- New code must stay strict-clean; CI (plan 003) enforces via `npm run typecheck`.
- If a future library ships non-strict types, prefer a narrow local wrapper over
  loosening the config.
