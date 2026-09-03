# Plan 024: Use collision-resistant project and frame IDs

> Executor instructions: replace short Math.random identifiers at project-creation boundaries with collision-resistant IDs plus explicit used-ID checks. Preserve IDs loaded from existing projects. This plan does not change the room merge policy; it prevents newly generated IDs from silently colliding with it.

## Status

- Priority: P2
- Effort: S–M
- Risk: LOW
- Depends on: plans/004-sanitize-project-json.md, plans/015-conflict-free-room-palette.md
- Category: bug / identity / realtime safety
- Planned at commit: b36fad5
- Planned at: 2026-09-03

## Why this matters

src/store/projectStore.ts:44-46 currently creates identifiers with a seven-character Math.random base-36 suffix. New sprite, frame, and raster-import IDs are not checked against existing IDs. In a collaborative room, mergeProjectChanges indexes sprites by ID. If a concurrently added sprite receives an existing ID, the merge can treat it as an already-known object and silently omit the new sprite.

The collision is rare in ordinary use but has a high consequence: the project identity graph becomes ambiguous and the lost edit is difficult to diagnose. A browser crypto source and a deterministic collision check remove the accidental dependence on a short random space while remaining compatible with IDs already present in saved projects.

## Current state

The current identity flow is:

- src/store/projectStore.ts:44-46 defines uid(prefix) using Math.random and seven base-36 characters.
- src/store/projectStore.ts:572 uses uid for addSprite.
- src/store/projectStore.ts:630 uses generated IDs during raster import.
- src/store/projectStore.ts:679 uses generated IDs for addFrame.
- src/realtime/protocol.ts:523-555 merges sprites by ID; an incoming added sprite whose ID is already present can fall through the existing-sprite path rather than being added.
- Tilemap data and frame collections retain these IDs, so changing an existing loaded ID would break references or alter exported projects.

There is already a randomId helper in roomClient.ts, but the project store should not import a DOM/socket-specific module merely to generate local identity. Keep the helper in a store-local, dependency-light module.

## Drift check

Run:

| Check | Command | Expected interpretation |
| --- | --- | --- |
| Committed drift | git diff --stat b36fad5..HEAD -- src/store/projectStore.ts src/realtime/protocol.ts | Empty or explainable branch commits |
| Working-tree drift | git diff --stat b36fad5 -- src/store/projectStore.ts src/realtime/protocol.ts | Expected to show active implementation changes |
| ID call sites | rg -n "function uid|uid\\(|Math\\.random|randomUUID|randomId|spriteId|frameId" src/store/projectStore.ts src/realtime/roomClient.ts src/realtime/protocol.ts | Confirm all generated-ID boundaries |

If the live store already uses a collision-resistant helper, verify that it checks IDs against the complete loaded project before adding a new object.

## Commands

Run from the repository root:

| Purpose | Command | Pass condition |
| --- | --- | --- |
| Typecheck | npm run typecheck | Exit 0 |
| Lint | npm run lint | Exit 0; the known CanvasStage warning may remain |
| Production build | npm run build | Exit 0 |
| Patch hygiene | git diff --check | No output |
| ID audit | rg -n "createUniqueId|uid\\(|Math\\.random|randomUUID|getRandomValues|used.*Ids" src/store/projectStore.ts src/store/projectIds.ts | No unguarded short-ID generator remains at project-creation call sites |

## Scope

Only edit:

- src/store/projectStore.ts
- src/store/projectIds.ts (new)

Do not rewrite existing imported IDs, change tilemap reference formats, alter room merge semantics, add authentication, or introduce a new persisted schema. Automated tests are deferred by the maintainer.

## Git workflow

Use a focused branch such as advisor/024-collision-resistant-project-ids if needed. Make one conventional commit, for example fix(identity): harden generated project ids. Do not push without separate operator authorization.

## Steps

### 1. Add a store-local unique ID helper

Create src/store/projectIds.ts with a small helper such as createUniqueId(prefix, usedIds). The helper must:

- prefer globalThis.crypto.randomUUID when available;
- otherwise use globalThis.crypto.getRandomValues to create sufficient entropy;
- retain a monotonic counter/time component as a final environment fallback, without using a short seven-character random suffix as the primary identity;
- normalize the prefix to the existing identifier-safe character policy;
- check the candidate against usedIds and retry on collision;
- return a candidate that is safe for the existing ID length validator.

Keep the helper independent of React, Zustand, PartySocket, and DOM event code. Do not expose or persist the counter as project data.

Run:

    npm run typecheck

Expected output: exit 0.

### 2. Collect complete used-ID sets at each creation boundary

Replace uid call sites with the helper and pass IDs from the whole current project:

- addSprite must avoid every existing sprite ID and every generated frame ID.
- addFrame must avoid every existing frame ID in the project, not only the active sprite.
- raster import must reserve the new sprite ID and all frame IDs before constructing the imported sprite.

Preserve all IDs from loaded or imported projects. The helper is for newly created objects only. If a generated frame ID is derived from a newly generated sprite ID, still reserve/check it explicitly so future changes to naming cannot create a collision.

Keep each mutation inside the existing store action/undo path. Do not mutate the project directly while building the used sets.

Run:

    npm run lint

Expected output: exit 0 with at most the known warning.

### 3. Make collision handling deterministic and visible during development

Ensure the helper cannot spin forever if a mocked or broken entropy source repeatedly returns a collision. Use a bounded retry with a deterministic fallback candidate or throw an internal error that the existing store action converts to its normal non-throwing failure result. Do not silently reuse an existing ID.

Audit that no project-creation path still calls Math.random directly. Existing random behavior unrelated to project identity may remain if it is not used as an object ID.

Run:

    npm run typecheck

Expected output: exit 0.

### 4. Review compatibility with collaboration and references

Trace:

1. A saved project with old short IDs loads unchanged.
2. A new sprite cannot collide with an existing sprite.
3. A new frame cannot collide with any existing frame.
4. Raster import reserves all of its generated IDs before committing.
5. A deliberately forced candidate collision is retried or rejected, never reused.
6. Room merge still uses stable IDs for existing objects and sees a newly generated sprite as new.
7. Tilemap references and undo snapshots remain unchanged for existing projects.

Run:

    npm run build
    git diff --check

Expected output: build exits 0 and diff check has no output.

## Test plan

Automated test authoring is deferred. Later tests should inject deterministic crypto output, force a collision against an existing sprite/frame ID, verify fallback behavior, load legacy IDs unchanged, and exercise raster import with multiple frames. A two-client room test should verify that concurrent sprite creation with forced candidate overlap still produces two distinct sprites.

## Done criteria

- New project and frame IDs use the store-local collision-resistant helper.
- Every generated ID is checked against the complete relevant set of existing IDs.
- Existing loaded/imported IDs are preserved.
- No project-creation call site relies on a seven-character Math.random ID.
- Forced collisions cannot silently overwrite or drop an object.
- npm run typecheck, npm run lint, npm run build, and git diff --check pass.
- The final diff is limited to Scope.

## STOP conditions

Stop and report if:

- the browser/runtime support matrix lacks both crypto APIs and no safe non-short fallback can satisfy the existing ID validator;
- changing an ID would be required to repair an existing project reference;
- a call site cannot obtain the complete used-ID set without changing store state outside Scope;
- room merge behavior still drops a new object after the generator is corrected;
- verification exposes an unrelated baseline failure.

## Maintenance notes

Keep generated identity and user-facing labels separate. Do not shorten UUID-derived IDs for aesthetics unless a collision check and a sufficiently large namespace are retained. If IDs later become externally addressable, document the format before changing it.
