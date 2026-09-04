# Plan 026: Add a private submission preflight script

> Executor instructions: add a credential-free local release check under
> `.private/`. The folder is private scratch space; do not put credentials,
> tokens, video files, or Devpost account data in it. The script may run the
> repository's existing verification commands and optionally check URLs passed
> through environment variables.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: release tooling
- **Planned at**: commit `77b3fa5`, 2026-09-03

## Why this matters

The code checks pass locally, but the remaining submission gates are easy to
forget because several are external: the live URL, accepted public repository,
public YouTube video, room origin, and Devpost form state. A local preflight
should make those states visible without ever collecting secrets.

## Scope

- `.private/submission-preflight.sh`
- `.gitignore`

The script must check the existing lint, typecheck, build, patch hygiene,
license, and WebMCP registration code. It should report missing external values
as pending by default and fail them only when `STRICT=1` is set.

## Done criteria

- `.private/` is ignored except for the safe script itself.
- The script contains no credential or project-specific secret.
- `npm run lint`, `npm run typecheck`, `npm run build`, and `git diff --check`
  are run by the script.
- Optional `LIVE_URL`, `PUBLIC_REPO_URL`, and `YOUTUBE_URL` checks use bounded
  network requests only when supplied.
- The script exits nonzero for local failures and, in strict mode, pending or
  unreachable external artifacts.

## Stop conditions

- Do not add a token, cookie, account credential, or private URL to the script.
- Do not make the script silently claim that an external artifact is verified.
