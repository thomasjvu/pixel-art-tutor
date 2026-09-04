# Plan 036 — PartyKit naming cleanup

## Goal

Make the app-owned room worker paths and configuration names consistently use
`partykit`, while preserving the public names required by the PartyServer and
PartySocket libraries.

## Scope

- Rename the local worker directory from `party/` to `partykit/`.
- Point the worker TypeScript and Wrangler entrypoint configurations at the new
  directory.
- Make `VITE_PARTYKIT_HOST` the canonical frontend environment variable, while
  accepting `VITE_PARTY_HOST` as a compatibility alias for existing setups.
- Update startup instructions, contributor guidance, skill documentation, and
  historical plan path references.
- Keep third-party package names, imports, and API-required fields such as
  PartySocket's `party` option unchanged.

## Verification

- Search for stale app-owned `party/` paths and canonicalize user-facing host
  references.
- Run `bash -n start.sh`, `npm run lint`, `npm run typecheck`, `npm run build`,
  and `git diff --check`.
