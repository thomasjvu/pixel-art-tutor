# Plan 001: Put the project under git with an initial commit

> **Executor instructions**: Follow this plan step by step. Run every verification
> command and confirm the expected result before moving to the next step. If any
> STOP condition occurs, stop and report — do not improvise.
>
> **Special note**: This plan runs in the MAIN working tree, not a worktree —
> worktree isolation is impossible before git exists, and this plan only adds a
> `.git` directory and one commit. It must not modify, delete, or reformat any
> existing file.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: dx
- **Planned at**: no VCS yet — directory state as of 2026-08-26 (this plan creates it)

## Why this matters

The project targets OpenAI's WebMCP Challenge (Devpost, deadline Sep 3 2026), whose
submission requires a public GitHub repo and a live URL. The directory is not a git
repository, so there is no history, no diffing, no revert path, and nothing to push.
Every other improvement plan depends on this one existing first.

## Current state

- Repo root `/Users/area/@pixel-art-tutor` contains: `src/`, `public/`, `index.html`,
  `package.json`, `package-lock.json`, `tsconfig*.json`, `vite.config.ts`,
  `.gitignore`, `.oxlintrc.json`, `README.md`, `LICENSE`, `dist/` (build output),
  `plans/` (advisor plans — include them in the commit).
- `.gitignore` already excludes `node_modules` and `dist` (verify in Step 1).
- `git rev-parse --short HEAD` currently fails: `fatal: not a git repository`.

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Check git state | `git rev-parse --short HEAD` | fails before plan, 7-char SHA after |
| Verify ignore rules | `git status --porcelain` (after init) | no `node_modules/` or `dist/` lines |
| Commit | `git commit -m "..."` | exit 0 |

## Scope

**In scope** (the only changes you may make):
- Run `git init` and make the initial commit (snapshot of existing files).
- You may append missing entries to `.gitignore` ONLY if verification in Step 1
  shows `node_modules/` or `dist/` are not ignored.

**Out of scope**:
- Editing any source file, config file, README, or plan file.
- Creating a GitHub remote or pushing (needs the user's `gh` auth; the user does that).
- Fixing the `package.json` name (that is plan 002).

## Git workflow

- Branch: none needed — this creates the repo's default branch (`main`).
- Single commit: `Initial commit: Pixel Art Tutor (WebMCP pixel art studio)`.

## Steps

### Step 1: Verify .gitignore covers build artifacts and dependencies

Read `.gitignore` at the repo root. Confirm it contains entries covering
`node_modules` and `dist`. If either is missing, append it on its own line.

**Verify**: `grep -E "^(node_modules|dist)$" .gitignore` → both `node_modules` and
`dist` appear. If you had to append, note it in your report.

### Step 2: Initialize the repository

From the repo root run exactly:

```bash
git init -b main
```

**Verify**: `git rev-parse --is-inside-work-tree` → `true`.

### Step 3: Stage and confirm the snapshot is clean

```bash
git add -A
git status --porcelain
```

**Verify**: the output contains NO line starting with `A` for paths under
`node_modules/` or `dist/`. If it does, STOP — the .gitignore is wrong; fix
`.gitignore` per Step 1 and re-stage.

### Step 4: Create the initial commit

```bash
git commit -m "Initial commit: Pixel Art Tutor (WebMCP pixel art studio)"
```

**Verify**: `git log --oneline` → exactly one commit; `git status --porcelain` →
empty output.

## Test plan

None — maintainer has deferred tests. Verification is the command gates above.

## Done criteria

- [ ] `git rev-parse --short HEAD` returns a SHA
- [ ] `git log --oneline` shows exactly one commit
- [ ] `git status --porcelain` is empty
- [ ] No tracked file lives under `node_modules/` or `dist/`:
      `git ls-files | grep -E "^(node_modules|dist)/" | wc -l` → `0`
- [ ] No pre-existing file was modified: `git status` shows a clean tree (nothing
      was edited; the commit only recorded what existed)

## STOP conditions

Stop and report back if:
- `.gitignore` is missing or does not cover `node_modules`/`dist` and you are
  unsure how to fix it.
- `git status --porcelain` after staging includes anything unexpected (e.g. files
  with secrets-like names: `.env`, `*.pem`, `*key*`). Do not commit those; report.
- Any step's verification fails twice.

## Maintenance notes

- The user (not you) will create the GitHub remote and push; suggest
  `gh repo create pixel-art-tutor --public --source=. --push` in your report as a
  hint, but do not run it.
- All later plans branch from the SHA this commit creates.
