# Plan 037 — 256×256 canvas and top-left app mark

## Goal

Make the default canvas a real 256×256 logical pixel grid and simplify the
chrome by placing the app mark beside File in the top-left menu while removing
the duplicate footer app branding.

## Scope

- Raise the sprite/canvas dimension limit to 256 and make blank canvases,
  project tabs, the blank-project form, imports, and WebMCP descriptions use
  the new size.
- Keep tilemap dimensions at the existing 2–64 limit with a dedicated limit so
  the canvas change does not unintentionally change map behavior.
- Default the canvas view to 1px per logical cell, yielding a 256×256 CSS view;
  zoom controls remain available for detailed editing.
- Keep project export/import and share snapshots viable for the larger default
  by using compact JSON and a bounded larger share-hash limit.
- Upgrade previously saved, untouched blank 64×64 canvases to blank 256×256
  canvases without altering non-empty projects.
- Move the pixel app mark into the top-left menu beside File and remove the
  footer’s duplicate app mark/brand block.
- Refresh current docs and plan notes so they describe the actual grid size.

## Verification

- Confirm no stale 64×64 canvas defaults or app-owned dimension caps remain.
- Run `bash -n start.sh`, `npm run lint`, `npm run typecheck`, `npm run build`,
  and `git diff --check`.
