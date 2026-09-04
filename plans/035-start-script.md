# Plan 035: Add one-command local startup

> Executor instructions: provide a dependency-free root launcher for the
> editor and optional room worker. It must clean up child processes on exit and
> must not start a redundant local room worker when `VITE_PARTYKIT_HOST` points to
> a deployed worker.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: plans/026-private-submission-preflight.md
- **Category**: developer experience
- **Planned at**: commit `77b3fa5`, 2026-09-03

## Scope

- `start.sh`
- `README.md`
- `AGENTS.md`

## Done criteria

- `./start.sh` starts Vite and the local room worker with sync enabled.
- `./start.sh --solo` starts only Vite.
- `VITE_PARTYKIT_HOST` selects an external room worker and suppresses the local
  worker.
- Ctrl-C stops child processes together.
- `bash -n start.sh` and `./start.sh --help` pass.
