# Plan 027: Rotate the local deployment credential before public handoff

> Executor instructions: this is an operator-only security plan. Do not print,
> copy, commit, or transmit the credential. Revoke/rotate it in the provider
> dashboard, remove the plaintext Git config header, and verify the replacement
> access path. Stop if the credential owner or replacement access path is not
> known.

## Status

- **Priority**: P0
- **Effort**: S
- **Risk**: HIGH if skipped; MEDIUM during access-path replacement
- **Depends on**: provider access and an approved secure credential path
- **Category**: security / release gate
- **Planned at**: commit `77b3fa5`, 2026-09-03

## Evidence

The local `.git/config` contains a plaintext Cloudflare access header. A scan of
tracked files and reachable commit history found no matching credential pattern,
so the finding is currently local-config exposure rather than proven repository
history exposure.

## Steps

1. Revoke the exposed credential in the Cloudflare dashboard or API.
2. Remove the plaintext header from local Git configuration.
3. Install the replacement through the approved credential helper or secure
   environment mechanism.
4. Test only the required Git/room operation; do not paste the secret into
   shell history, plans, README, `.private/`, or chat.
5. Run the preflight secret scan and inspect `git diff`/`git status`.

## Stop conditions

- Stop if rotation would require guessing which account owns the credential.
- Stop if a command would display the secret or store it in a tracked file.
- Do not mark this complete from source inspection alone.
