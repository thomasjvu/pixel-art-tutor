# Plan 029: Publish and verify the accepted code repository

> Executor instructions: publish the current project to a public GitHub,
> GitLab, or Bitbucket repository. The current Forgejo origin is useful for
> collaboration but is not one of the providers named by the challenge.

## Status

- **Priority**: P1
- **Effort**: S–M
- **Risk**: MEDIUM
- **Depends on**: plans/027-credential-rotation-handoff.md
- **Category**: submission / repository visibility
- **Planned at**: commit `77b3fa5`, 2026-09-03

## Steps

1. Confirm the current branch and working tree contain the intended source.
2. Push the complete project to a public accepted-provider repository.
3. Make the current code the visible default branch or provide a clearly
   labeled current branch in the Devpost form.
4. Verify the repository in an incognito window.
5. Confirm `LICENSE`, README, `src/webmcp/registerTools.ts`, assets, and run
   instructions are visible.
6. Confirm the repository's About section identifies the open-source license.

## Done criteria

- An unauthenticated browser can view the current source and license.
- The visible revision includes the actual WebMCP registration and all runtime
  instructions.

## Stop conditions

- Do not expose `.private/`, credentials, cookies, or local provider config.
- Do not call the Forgejo URL an accepted-provider submission repository.
