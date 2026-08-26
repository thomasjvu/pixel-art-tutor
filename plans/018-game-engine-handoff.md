# Plan 018: Turn sprite exports into a predictable game-engine handoff

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the next
> step. If anything in the "STOP conditions" section occurs, stop and report — do
> not improvise. Modify only the files in Scope. Update this plan's status row in
> `plans/README.md` when complete unless a reviewer maintains the index.
>
> **Drift check (run first)**: `git diff --stat 78aad52..HEAD -- src/engine/exportImage.ts src/components/ProjectMenu.tsx README.md src/engine/exportManifest.ts` and
> `git diff --stat 78aad52 -- src/engine/exportImage.ts src/components/ProjectMenu.tsx README.md src/engine/exportManifest.ts`.
> The second command includes unstaged changes. If the Current state excerpts do
> not match the live code, stop and refresh this plan.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: MED (file naming and engine metadata must stay synchronized with generated PNGs)
- **Depends on**: plans/004-sanitize-project-json.md, plans/013-share-permalink.md
- **Category**: direction / migration
- **Planned at**: commit `78aad52`, 2026-08-26

## Why this matters

The studio can already export an active sprite as a PNG/sheet and generate a
Godot `.tres` or Unity `.meta`/manifest pair. The workflow is still sprite-by-
sprite and the generated metadata is not accompanied by one project-level
manifest describing every sprite, animation frame, palette, or tilemap. That
makes the feature feel like a demo download rather than a reliable game-dev
handoff.

This plan preserves the existing engine-specific helpers and adds a documented,
engine-neutral game-pack manifest plus one-click project-wide sheet exports. It
does not attempt to create a full Godot project or Unity project; it makes the
generated files deterministic and easy to drop into either tool.

## Current state

- `src/engine/exportImage.ts:4-30` renders one sprite or all of its frames into a
  horizontal sheet. `downloadCanvas` and `downloadText` create browser downloads.
- `src/engine/exportImage.ts:64-92` emits a Godot `SpriteFrames` resource for one
  sprite and references `res://art/<stem>-sheet.png`.
- `src/engine/exportImage.ts:105-223` emits Unity texture-import metadata and a
  separate JSON manifest for one sprite.
- `src/components/ProjectMenu.tsx:47-88` only exports the active sprite. Godot
  downloads a sheet plus `.tres`; Unity downloads a sheet plus `.meta` and a JSON
  manifest. There is no project-wide export action.
- `src/store/projectStore.ts:612-614` exports the complete project JSON; plan
  013 adds the complementary `import_project`/share flow. Do not duplicate that
  import implementation here.
- `src/types.ts:20-33` defines tilemap data as dimensions plus sprite IDs; the
  handoff manifest must preserve those IDs and provide the corresponding exported
  texture/frame names.
- Conventions: pure data transforms belong in `src/engine/`; browser download
  side effects stay in components or the existing `exportImage.ts`; filenames use
  `spriteFileStem`; no new engine SDK is required.

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Typecheck | `npm run typecheck` | exit 0 |
| Lint | `npm run lint` | exit 0 |
| Build | `npm run build` | exit 0 |

## Scope

**In scope**:

- `src/engine/exportManifest.ts` (create) — pure project-wide manifest builder.
- `src/components/ProjectMenu.tsx` — project-wide game-pack export action and
  stable file naming.
- `src/engine/exportImage.ts` — only small helper adjustments required to keep
  filenames/metadata consistent with the pack contract.
- `README.md` — document the pack contents, copy locations, and current limits.

**Out of scope**:

- A ZIP library, server upload, filesystem permissions, or an engine plugin.
- Changing the project JSON schema or the `import_project`/permalink flow.
- Generating a complete `.godot` project, Unity scene, Animator Controller, or
  tilemap scene.
- Changing pixel rendering, palette semantics, frame timing, or room behavior.

## Git workflow

- Branch: `advisor/018-game-engine-handoff`.
- Commit: `feat: export deterministic project packs for game engines`.
- Do not push or open a PR unless explicitly instructed.

## Steps

### Step 1: Define the engine-neutral manifest contract

Create `src/engine/exportManifest.ts` with a pure function such as
`buildGamePackManifest(project: Project, fps: number): string` or a typed object
builder plus a JSON wrapper. The serialized top-level shape must be versioned:

```ts
{
  format: "pixel-art-tutor/game-pack",
  version: 1,
  project: { name, palette },
  fps,
  sprites: [{
    id, name, kind, width, height,
    texture: "<stem>-sheet.png",
    frames: [{ id, index, name, rect: { x, y, width, height } }]
  }],
  tilemap: null | {
    cols, rows,
    cells: [{ index, x, y, tileId, spriteId, spriteName } | null]
  }
}
```

Requirements:

- include every project sprite, not only the active one;
- use `spriteFileStem` for texture/frame names and ensure duplicate stems receive
  deterministic suffixes so files cannot overwrite one another;
- frame rectangles match `renderSpriteToCanvas(..., { allFrames: true })` exactly:
  horizontal layout, zero-based `x`, `y: 0`, and native sprite dimensions;
- include a null tilemap when none exists; for non-null cells, retain the original
  tile ID and include resolved sprite metadata when the ID still exists;
- round/clamp FPS using the same rule as the existing engine helpers;
- return stable JSON ordering so two exports of the same project compare cleanly;
- never include browser-only objects or data URLs in the manifest.

Keep the helper pure and independent of React, DOM, zustand, and room code.

**Verify**: `npm run typecheck` → exit 0.

### Step 2: Make all generated files agree on names and rectangles

Review `renderSpriteToCanvas`, `godotSpriteFrames`, `unityTextureMeta`, and
`unitySpriteManifest` together. Introduce one filename/rectangle convention and
reuse it across helpers. If duplicate sprite names can collide, pass an explicit
resolved stem from the project-pack caller instead of changing the behavior of
the existing single-sprite export unexpectedly.

For each sprite, the generated sheet and every metadata file must refer to the
same `<stem>-sheet.png` filename. Do not silently use the active sprite's name in
a project-wide export. Keep Godot `res://art/` and Unity multiple-sprite slicing
semantics documented; do not add engine-specific assumptions to the neutral
manifest.

**Verify**: `npm run lint && npm run typecheck` → both exit 0; `rg -n "sheet\.png|Rect2|rect:" src/engine/exportImage.ts src/engine/exportManifest.ts` shows one consistent horizontal frame convention.

### Step 3: Add a project-wide “Export game pack” action

In `src/components/ProjectMenu.tsx`, add a menu action that:

1. Reads the current project and FPS from stores.
2. Builds and downloads `<project-stem>.pixel-pack.json`.
3. Renders/downloads one `<sprite-stem>-sheet.png` for every sprite, using the
   same collision-safe stems as the manifest.
4. Leaves the existing active-sprite PNG, Godot, and Unity actions available.

Because browsers may block many downloads, show a short non-modal hint in the
menu or activity area explaining that the manifest and sheets belong together.
Do not introduce a fake ZIP download. If the browser blocks a later file, the
manifest must still identify the missing filename clearly.

Keep all side effects in the component; the manifest builder remains pure.

**Verify**: `npm run typecheck` → exit 0; inspect the menu to confirm the new
action does not change the existing active-sprite actions.

### Step 4: Document the handoff

Update `README.md` to describe:

- the project-pack filename and contents;
- that sheets are horizontal, one native-size frame per cell;
- where to place sheets for the generated Godot `.tres` (`res://art/`) and Unity
  metadata beside the matching PNG;
- that the current pack is engine-neutral plus optional active-sprite Godot/Unity
  helpers, not a complete engine project;
- the 64×64 sprite, 32-frame, 64-color, and 128-sprite limits if they affect
  downstream files.

Do not claim that importing a pack creates a Godot scene or Unity Animator; that
would require a separate plugin/project generator.

**Verify**: `rg -n "pixel-pack|game pack|horizontal" README.md` → documentation
exists; `npm run lint && npm run typecheck && npm run build` → all exit 0.

### Step 5: Review output determinism and edge cases

Read the complete diff and trace:

1. A project with no tilemap.
2. A project with two sprites whose names normalize to the same stem.
3. A 1-frame sprite and a multi-frame sprite.
4. A rectangular sprite and non-default FPS.
5. A tilemap cell referring to a deleted/missing sprite (the manifest records the
   original ID but does not invent texture metadata).
6. A project with transparent pixels and an empty palette entry set allowed by
   the current validator.

If Godot or Unity command-line tooling is installed, validate one generated
fixture with that tool. If neither is installed, perform structural checks on
the generated text and report engine-runtime validation as outstanding; do not
pretend a string inspection is an engine import test.

**Verify**: `git diff --check` → no output; all gates exit 0.

## Test plan

Automated tests are deferred by the maintainer decision in `plans/README.md`.
When tests are introduced, test `buildGamePackManifest` as a pure function:
stable ordering, duplicate stems, frame rectangles, tilemap mapping, FPS
normalization, and missing tile references. Add fixture-based validation for a
Godot `.tres` and Unity metadata once the repository has engine fixtures or the
corresponding command-line tools.

## Done criteria

- [ ] A versioned project-wide manifest includes every sprite, frame rectangle,
      palette, FPS, and tilemap cell.
- [ ] Every manifest texture filename matches a downloaded sheet filename.
- [ ] Duplicate stems cannot overwrite files silently.
- [ ] Existing active-sprite PNG/Godot/Unity actions still work.
- [ ] README documents exact placement and limits without overstating engine
      integration.
- [ ] `npm run lint`, `npm run typecheck`, and `npm run build` exit 0.
- [ ] Only the files listed in Scope are modified.

## STOP conditions

- A complete handoff requires a ZIP/filesystem API or an engine-specific project
  generator; stop and split that larger product decision instead of adding a
  dependency opportunistically.
- The current Godot or Unity metadata is rejected by an installed engine tool;
  stop and report the exact importer error before changing format strings.
- Two project sprites cannot be given deterministic unique stems without changing
  the existing single-sprite export filenames; stop and ask which naming behavior
  should win.
- The manifest would need to encode undocumented project fields; stop and update
  the project schema decision first.

## Maintenance notes

- Treat the manifest format as a public contract. Increment `version` for
  incompatible field changes and keep old fields readable where practical.
- Any new export target must consume the same frame rectangles and collision-safe
  stems; do not recalculate them independently in a component.
- A future ZIP or engine plugin can wrap this manifest and sheets without changing
  the core project model.
