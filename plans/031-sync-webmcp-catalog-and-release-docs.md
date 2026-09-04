# Plan 031: Synchronize the WebMCP catalog and release documentation

> Executor instructions: update only documentation/index metadata. Keep the
> single-file registration showcase intact. The canonical count must match the
> runtime and the catalog must include newer layer, cel, tag, palette, and view
> tools.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: no code dependency
- **Category**: documentation / WebMCP leverage
- **Planned at**: commit `77b3fa5`, 2026-09-03

## Scope

- `README.md`
- `AGENTS.md`
- `plans/README.md`
- `skills/pixel-art-tutor/SKILL.md`

## Steps

1. Derive the current imperative/declarative count from the registration
   surface and runtime smoke test.
2. Replace stale counts and add a categorized catalog for project, pixel,
   palette, layers/cels, animation, tilemap, tutorial, and export operations.
3. Update `new_canvas` and character-animation documentation to the four-frame
   default from plan 034.
4. Reconcile branch/SHA and browser-QA notes in `plans/README.md`.
5. Keep the accepted-provider, live URL, and video fields clearly external
   rather than filling them with placeholders.

## Done criteria

- No documentation says 21 or 30 tools.
- The README accurately describes the actual registration and testing path.
- `git diff --check` and the standard build checks pass.
