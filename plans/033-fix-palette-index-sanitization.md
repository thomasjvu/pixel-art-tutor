# Plan 033: Preserve palette indices when sanitizing imports

> Executor instructions: fix the untrusted import/permalink path without
> changing valid project behavior. Add a focused characterization test only if
> the maintainer enables the deferred test suite; otherwise verify with a small
> non-committed harness or direct pure-function reasoning.

## Status

- **Priority**: P2
- **Effort**: S–M
- **Risk**: MEDIUM
- **Depends on**: none
- **Category**: correctness / data integrity
- **Planned at**: commit `77b3fa5`, 2026-09-03

## Evidence

`sanitizeProject` filters invalid palette entries before `sanitizeFrames` checks
pixel indices against the shortened palette. An invalid entry in the middle can
shift later colors or turn a previously valid later index into transparency.

## Steps

1. Choose one invariant: reject a project with invalid palette entries, or
   preserve index positions while replacing invalid entries with a safe color.
2. Keep `paletteAlpha` aligned with the selected invariant.
3. Exercise local storage recovery and `import_project` with valid projects and
   malformed middle-palette input.
4. Ensure valid compact palettes and share permalinks serialize identically.

## Done criteria

- Malformed palette entries cannot remap valid pixel indices silently.
- Valid imports retain existing colors and frame data.
- Standard checks pass.
