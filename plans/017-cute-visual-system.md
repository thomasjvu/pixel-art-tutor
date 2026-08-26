# Plan 017: Reframe the studio as a cute, light, flat pixel editor

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the next
> step. If anything in the "STOP conditions" section occurs, stop and report — do
> not improvise. Modify only the files in Scope. Update this plan's status row in
> `plans/README.md` when complete unless a reviewer maintains the index.
>
> **Drift check (run first)**: `git diff --stat 78aad52..HEAD -- src/App.tsx src/index.css src/components/Icon.tsx src/components/AgentPanel.tsx src/components/RoomPanel.tsx src/components/SpritesPanel.tsx src/components/TilemapPanel.tsx package.json package-lock.json` and
> `git diff --stat 78aad52 -- src/App.tsx src/index.css src/components/Icon.tsx src/components/AgentPanel.tsx src/components/RoomPanel.tsx src/components/SpritesPanel.tsx src/components/TilemapPanel.tsx package.json package-lock.json`.
> The second command includes unstaged changes. If the current component markup
> differs materially from the Current state below, stop and refresh the plan.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: MED (visual-only changes can still damage responsive layout and tool discoverability)
- **Depends on**: none; execute after the functional plans if possible
- **Category**: direction / tech-debt
- **Planned at**: commit `78aad52`, 2026-08-26

## Why this matters

The studio's current feature set is useful, but the visual hierarchy reads as a
dense monitoring dashboard: a window frame, header status chips, menu bar, narrow
icon toolbar, canvas, timeline, seven inspector tabs, and a bottom status bar are
all visible at once. Typography is mostly 8–10px uppercase labels and many icons
are platform-dependent Unicode glyphs. The desired product direction is cute,
light, flat, calm, and playful in the spirit of Nintendo's approachable UI without
copying Nintendo artwork or branding.

This plan keeps the existing editor behavior and panel coverage while making the
canvas and timeline the visual focus. It also replaces the pseudo-icon layer with
a consistent local pixel icon set, removes dead icon dependencies, and raises the
minimum readable UI size.

## Current state

- `src/App.tsx:101-230` renders the complete shell in a fixed hierarchy:
  `.app-header`, `ProjectMenu`, `.workspace` containing `Toolbar`,
  `CanvasStage`/`TimelinePanel`, and a seven-tab Inspector, followed by
  `StatusBar`. Do not remove any feature or store action in this plan.
- `src/index.css:1-24` defines a warm paper palette and Inter/system typography,
  but much of the file repeats literal accent colors and uses a dense 8–10px type
  scale. Examples include `.eyebrow` at `src/index.css:131-139`, tool labels at
  `:491-497`, and tab labels at `:1234-1249`.
- `src/index.css:462-467` gives the toolbar 68px and the Inspector 340px while
  the editor column reserves a 238px timeline. These proportions should remain
  functional, but the canvas needs stronger visual priority and the side panels
  should feel secondary.
- `src/components/Icon.tsx:1-43` maps names such as `mingcute:eraser` and
  `mingcute:bucket` to Unicode characters (`⌫`, `▰`, etc.). This renders
  differently across fonts and is not a coherent icon family.
- `package.json:16-17` declares `@iconify/json` and `@iconify/react`, but `rg`
  finds no source imports. The installed JSON package is very large and should
  not remain as dead runtime dependency weight.
- Literal decorative glyphs also occur in `AgentPanel.tsx`, `RoomPanel.tsx`,
  `SpritesPanel.tsx`, and `TilemapPanel.tsx`. Replace decorative glyphs with the
  local `Icon` component or ordinary text; never add emoji as a substitute.
- Conventions: components use React + zustand selectors; visual changes must not
  mutate project data directly. The existing CSS class names are the shared
  styling surface. Preserve keyboard shortcuts, `aria-label`s, focus outlines,
  pixelated canvas rendering, reduced-motion behavior, and mobile breakpoints.

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Typecheck | `npm run typecheck` | exit 0 |
| Lint | `npm run lint` | exit 0 |
| Build | `npm run build` | exit 0 |
| Dependency check | `npm ls --depth=0` | no missing dependency errors |

## Scope

**In scope**:

- `src/index.css` — visual tokens, typography, spacing, surfaces, controls, and
  responsive treatment.
- `src/components/Icon.tsx` — local consistent 16×16 flat/pixel icon renderer,
  retaining the current `Icon({ icon: string })` call signature.
- `src/App.tsx` — only markup/class/accessible-label adjustments needed for the
  visual hierarchy; keep the current tab and keyboard behavior.
- `src/components/AgentPanel.tsx`, `src/components/RoomPanel.tsx`,
  `src/components/SpritesPanel.tsx`, `src/components/TilemapPanel.tsx` — replace
  decorative emoji/symbols and adjust labels only where needed for consistency.
- `package.json`, `package-lock.json` — remove the unused Iconify packages after
  confirming there are no imports.

**Out of scope**:

- Store, WebMCP, realtime, export, or engine behavior.
- New illustrations, copyrighted Nintendo assets, external font downloads, or a
  new UI framework.
- Removing the toolbar, timeline, Inspector, Agent panel, or Room panel.
- Changing canvas pixel colors, sprite data, tool semantics, or keyboard shortcuts.

## Git workflow

- Branch: `advisor/017-cute-visual-system`.
- Commit: `style: simplify the studio into a cute flat pixel editor`.
- Do not push or open a PR unless explicitly instructed.

## Visual rules to implement

Use these rules as acceptance criteria rather than inventing a new aesthetic per
component:

1. Use a small token set: warm off-white background, white surface, soft cream
   secondary surface, charcoal/navy ink, muted gray text, coral primary action,
   mint success, sky secondary, and one sunny yellow highlight. Component CSS
   should reference variables; literal hex values are reserved for the brand mark,
   pixel art, and the token definitions themselves.
2. Favor flat surfaces, 1px soft borders, modest 6–10px radii, and nearly no
   shadows. Menus may retain one restrained shadow for layering. Do not add
   gradients, glassmorphism, glow effects, or decorative noise.
3. Use readable sentence-case labels. Keep small metadata compact, but interactive
   labels should be at least 11px at the default desktop size and at least 12px
   when the layout is narrow. Keep monospace only for pixel coordinates, IDs,
   numeric counters, and code-like data.
4. Make the canvas the largest, quietest area. The toolbar and Inspector should
   have lower contrast than the active canvas/timeline, and active states should
   use one clear coral or mint treatment rather than several competing boxes.
5. Preserve a clear pressed/focus/disabled state for every button. Ensure the
   focus outline remains visible against the lighter surfaces.
6. Keep the design visibly pixel-art-native through crisp thumbnails, checkerboard
   transparency, square/corner details, and the timeline — not through emoji,
   random symbols, or faux-retro clutter.

## Steps

### Step 1: Replace the pseudo-icon layer with coherent local icons

Rewrite `src/components/Icon.tsx` without adding a package. Retain the public
component signature so callers do not change. Render a 16×16 inline SVG with
`shapeRendering="crispEdges"`, `fill="currentColor"`, and a small hand-authored
path/rect map for every currently used icon key:

`pencil`, `eraser`, `bucket`, `eye`, `undo-2`, `redo-2`, `grid-2`, `layers`,
`question`, `sparkles-2`, `file-new`, `folder-open-2`, `image-2`, `save-2`,
`game-2`, `box-3`, `gallery`, `back-2`, `forward-2`, `pause-fill`, `play-fill`,
`add`, `mouse`, `picture`, `palette`, `movie`, `map`, `bulb`, `bot`, `group`,
`bulb-2`, `close-circle`, `alert`, `information`, `lightbulb`, `cursor`, and
`cross`.

The exact paths may be hand-drawn, but each icon must use the same grid, weight,
and visual language. Unknown names should render a neutral 4×4 square rather
than a Unicode bullet. Keep `aria-hidden="true"` because current callers provide
their own accessible labels/titles.

Replace decorative `✦`, `◎`, `•`, `🧽`, and similar glyphs in the scoped components
with an existing icon key or plain text. Do not use an emoji font.

**Verify**: `rg -n "✦|◎|•|🧽|⌫|▰|◉|↶|↷" src/components` → no decorative icon
matches in the scoped components; `npm run typecheck` → exit 0.

### Step 2: Consolidate the visual tokens and type scale

At the top of `src/index.css`, define the agreed token set and update component
rules to consume it. Remove duplicated literal accent colors such as repeated
`#398d7a`, `#e0f2ea`, and `#9ccfbe` in favor of named mint tokens. Keep the
checkerboard transparency pattern, but use named checker colors.

Raise the default interactive text sizes as described in the Visual rules. Use
sentence case in visible labels where the JSX currently relies on
`text-transform: uppercase`; retain uppercase only for tiny non-interactive
eyebrows if it remains readable. Normalize button radii, border colors, active
states, and hover states so the UI has one button family.

Do not globally replace all colors blindly: canvas pixel colors and inline brand
mark fills are data/illustration, not UI tokens.

**Verify**: `rg -n "#398d7a|#e0f2ea|#9ccfbe" src/index.css` → zero component-rule
matches outside the token definitions; `npm run lint` → exit 0.

### Step 3: Rebalance the shell without removing features

Update the shell styles/classes so the hierarchy is:

- project/title strip is calm and compact;
- menu is a quiet navigation row, not a second heavy toolbar;
- central canvas has the highest area and contrast priority;
- timeline reads as the animation workspace with clear frame selection;
- toolbar and Inspector are supportive surfaces with fewer visual boundaries;
- room/agent status remains discoverable but does not dominate the header.

Keep the current three-column desktop layout and existing compact breakpoints unless
the browser check shows a concrete overflow bug. Preserve all labels/titles and
the `aria-selected` tab state. At 560px and below, verify that tool icons, tab
icons, timeline controls, and status information remain usable after labels are
shortened or hidden.

**Verify**: `npm run typecheck && npm run build` → both exit 0.

### Step 4: Remove dead icon dependencies

After Step 1 confirms there are no imports, remove `@iconify/json` and
`@iconify/react` from `package.json` and update `package-lock.json` using the
repository's package manager. Do not remove `partysocket`, React, zustand, or any
package with a live import.

**Verify**: `rg -n "@iconify|Iconify" src package.json package-lock.json` → no
matches; `npm install --package-lock-only` → exit 0; `npm ls --depth=0` → no
missing dependency errors.

### Step 5: Visual regression review

Run the app and inspect at minimum a 1440×900 desktop viewport and a narrow
390px viewport. Confirm all of the following manually:

1. A blank project and the starter project render without a layout shift.
2. Pencil, eraser, fill, picker, undo, redo, grid, onion skin, zoom, frame
   playback, import/export menus, Agent, and Room controls remain discoverable.
3. Active tool, active tab, focus ring, disabled undo, room status, agent status,
   and cursor overlays remain visually distinguishable.
4. Canvas and checkerboard remain crisp; thumbnails do not blur or acquire
   rounded clipping that hides pixels.
5. Text is readable without relying on emoji or a platform-specific symbol font.

If browser tooling is available, capture both screenshots for review. Do not
change behavior to make a screenshot look correct; report a functional issue to
the appropriate plan instead.

**Verify**: `npm run lint && npm run typecheck && npm run build` → all exit 0.

## Test plan

Automated tests are deferred by the maintainer decision recorded in
`plans/README.md`. When tests are introduced, add a lightweight component/smoke
check that the icon map covers every key used by `App.tsx`, `Toolbar.tsx`,
`TimelinePanel.tsx`, `ProjectMenu.tsx`, and the scoped panels. The primary
verification for this plan is the two-viewport visual review in Step 5.

## Done criteria

- [ ] Every current `Icon` key renders through the local consistent icon map; no
      scoped component uses emoji/decorative Unicode as an icon.
- [ ] Interactive labels meet the readable type-scale rule at desktop and mobile
      breakpoints.
- [ ] UI component rules use the consolidated tokens; repeated accent literals
      are removed from component rules.
- [ ] Toolbar, canvas, timeline, Inspector, menu, and status bar all remain
      present and usable.
- [ ] `@iconify/json` and `@iconify/react` are absent from manifest and lockfile.
- [ ] `npm run lint`, `npm run typecheck`, and `npm run build` exit 0.
- [ ] Only the files listed in Scope are modified.

## STOP conditions

- A visual change requires altering a store action, WebMCP tool, room protocol,
  export format, or canvas drawing behavior; stop and hand that change to the
  relevant functional plan.
- Removing or hiding a control makes a current keyboard shortcut or accessible
  action unreachable; stop and preserve the control.
- An icon key is used by a caller but cannot be represented by the planned local
  icon map; add the key explicitly or stop, never fall back to emoji.
- The new color tokens make canvas pixel colors or checkerboard transparency
  ambiguous; stop and adjust the UI tokens without touching project data.

## Maintenance notes

- New UI icons must be added to the local map with a 16×16 crisp shape and an
  accessible title/label at the caller. Do not add an icon dependency for one
  symbol.
- Keep the token definitions near the top of `index.css`; review new literal
  colors in PRs so the palette does not drift back into dashboard-like noise.
- If the product later introduces detachable windows, preserve this hierarchy:
  canvas first, timeline second, inspector/context third.
