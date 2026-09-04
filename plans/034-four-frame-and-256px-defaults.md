# Plan 034: Default new character work to four frames and a 256px canvas view

> Executor instructions: interpret “256px” as the default displayed canvas box,
> not a 256×256 art grid. The original implementation kept a 64×64 art-pixel
> limit and rendered it at 4px per cell.
> Preserve explicit frame counts and explicit zoom changes.

## Status

- **Priority**: P1
- **Effort**: S–M
- **Risk**: LOW
- **Depends on**: none
- **Category**: editor defaults / agent ergonomics
- **Planned at**: commit `77b3fa5`, 2026-09-03

## Steps

1. Add a named four-frame default for new character sprites and blank canvases.
2. Add optional `frameCount` to the `add_sprite` WebMCP tool and declarative
   new-sprite form; honor explicit values from 1 through the existing maximum.
3. Preserve copied source frame counts when no explicit count is supplied.
4. Add optional `frameCount` to `new_canvas`, preserving `confirm:true`.
5. Generate blank canvas frame IDs/pixels for the selected count.
6. Change the editor's default zoom from 6px/cell to 4px/cell and document that
   the default 64×64 view is 256×256 CSS pixels.
7. Update tool descriptions, README, AGENTS, and the pixel-art tutor skill.

## Done criteria

- A new character defaults to four frames.
- An explicit `frameCount: 2` or `frameCount: 1` remains respected.
- A blank canvas defaults to four frames and a 256px displayed canvas.
- Item/tile defaults remain one frame unless explicitly requested otherwise.
- Zoom controls still allow the existing 1–48px/cell range.
- Standard checks pass and WebMCP schemas expose the new optional fields.

## Stop conditions

- This plan was superseded by Plan 037 after the user clarified that 256×256
  must be the actual logical art grid, not only its displayed size.
- Do not change existing saved projects' frame counts during hydration.
