# Plan 025: Avoid full-project scans when deriving room patches

> Executor instructions: add trusted mutation metadata so ordinary local pixel/tile edits can derive bounded room patches without walking every sprite, frame, and cell. Preserve the existing full-scan fallback for unknown or structural changes. Execute after the realtime wire/reconciliation plans because the change metadata flows through the outbox.

## Status

- Priority: P2
- Effort: M
- Risk: MED
- Depends on: plans/014-reliable-room-outbox.md, plans/015-conflict-free-room-palette.md, plans/016-bounded-room-operations.md, plans/022-single-payload-room-snapshots.md
- Category: performance / realtime / store integration
- Planned at commit: b36fad5
- Planned at: 2026-09-03

## Why this matters

src/realtime/protocol.ts:430-451 derives a room patch by scanning all sprites, frames, and pixels in before and after projects. roomClient.ts:579-586 invokes that derivation on every local outbox flush. At the configured one-million-cell project limit, a single click, agent pixel edit, or tile edit can perform work proportional to the entire project even though the mutation touched one coordinate.

Stroke coalescing reduces repeated scans for a long drag, but it does not help isolated edits, agent calls, fills, or tile placement. The room patch format already contains bounded cell changes; the store can carry the touched coordinates along with the ProjectChange so the protocol only inspects those locations.

## Current state

The relevant flow is:

- src/realtime/projectEvents.ts defines ProjectChange with previousProject, project, source, and label, but no mutation metadata.
- src/store/projectStore.ts creates ProjectChange records through its commit/queue path. Pixel, fill, transform, and tile actions do not expose touched-cell metadata to the realtime layer.
- src/realtime/protocol.ts:430-451 walks every sprite, frame, and pixel to derive a patch and returns null for structural changes.
- src/realtime/roomClient.ts:579-586 calls projectChangeToRoomPatch during flushProjectOutbox.
- src/realtime/protocol.ts:474-476 applies a remote patch by cloning the project; that remote clone is outside this finding and should not be changed as a drive-by optimization.

The store is the source of truth and agent tools already route edits through store actions, so mutation hints can cover human and agent edits consistently.

## Drift check

Run:

| Check | Command | Expected interpretation |
| --- | --- | --- |
| Committed drift | git diff --stat b36fad5..HEAD -- src/realtime/projectEvents.ts src/store/projectStore.ts src/realtime/protocol.ts src/realtime/roomClient.ts | Empty or explainable branch commits |
| Working-tree drift | git diff --stat b36fad5 -- src/realtime/projectEvents.ts src/store/projectStore.ts src/realtime/protocol.ts src/realtime/roomClient.ts | Expected to show active implementation changes |
| Diff flow | rg -n "ProjectChange|commit\\(|finishStroke|setColorAt|drawLine|fill|tile|projectChangeToRoomPatch" src/realtime/projectEvents.ts src/store/projectStore.ts src/realtime/protocol.ts src/realtime/roomClient.ts | Confirm all mutation and derivation boundaries |

If an equivalent hint or revision index is already present, measure whether it is complete for every pixel/tile action before adding a second metadata path.

## Commands

Run from the repository root:

| Purpose | Command | Pass condition |
| --- | --- | --- |
| Typecheck | npm run typecheck | Exit 0 |
| Lint | npm run lint | Exit 0; the known CanvasStage warning may remain |
| Production build | npm run build | Exit 0 |
| Patch hygiene | git diff --check | No output |
| Hint audit | rg -n "ProjectChangeHint|changedCells|changedTiles|hint|projectChangeToRoomPatch" src/realtime/projectEvents.ts src/store/projectStore.ts src/realtime/protocol.ts src/realtime/roomClient.ts | Shows metadata creation, coalescing, and consumption |

## Scope

Only edit:

- src/realtime/projectEvents.ts
- src/store/projectStore.ts
- src/realtime/protocol.ts
- src/realtime/roomClient.ts

Do not change the room patch wire format, palette alphabet, structural merge policy, remote full-project cloning, project limits, or UI. Do not remove the safe full-scan fallback when metadata is missing. Automated tests are deferred by the maintainer.

## Git workflow

Use a focused branch such as advisor/025-hinted-room-patch-derivation if needed. Make one conventional commit, for example perf(realtime): derive patches from mutation hints. Do not push without separate operator authorization.

## Steps

### 1. Define a complete-but-conservative ProjectChange hint

Add a small serializable hint type in src/realtime/projectEvents.ts. It should distinguish at least:

- cells: a complete deduplicated set of sprite ID, frame index, x, y coordinates, plus any tile indices;
- palette-only or metadata-only changes that do not require a pixel scan; and
- unknown, which explicitly requests the existing full-scan fallback.

Keep hints local metadata, not a new wire field. Coordinates are used to derive the existing RoomPatch and are not authoritative remote data. Give coalescing a clear invariant: if two changes are combined and either hint is unknown or the union cannot be proven complete, the combined hint is unknown.

Do not include entire pixel arrays in the hint. Deduplicate repeated points from a drag and bound the metadata using the same operation-size protections already used for room patches.

Run:

    npm run typecheck

Expected output: exit 0.

### 2. Emit hints from every ordinary local mutation

Thread an optional hint through the store's existing commit/change-event path without bypassing store actions. Cover:

- setColorAt and drawLine;
- stroke aggregation in finishStroke, using the union of points touched during the stroke;
- applyPixelChanges;
- clear-frame, fill, and flood-fill operations, recording the actual changed coordinates or marking the hint unknown when the operation cannot prove them;
- tile placement and tile fills, recording changed tile indices;
- palette-only edits when they do not change pixel cells.

For all-frames operations, include coordinates for each affected frame. For transforms, sprite/frame add/delete, resize, reorder, rename, imports, and other structural edits, use unknown so the existing snapshot path remains selected.

Ensure every agent tool that mutates pixels or tiles receives a hint through the same store method as the UI. Do not maintain a separate agent-only diff path.

Run:

    npm run lint

Expected output: exit 0 with at most the known warning.

### 3. Preserve hints while changes coalesce

Update the project event queue so a coalesced pending change retains the first previousProject, the newest project, and the unioned hint when the union is complete. If the first or later change is unknown, drop the hint and retain correctness through the full-scan fallback.

Make in-flight and pending changes carry their hints through welcome reconciliation, retry, and the structural snapshot flow from plan 022. A retry must not accidentally lose the metadata or use a hint that describes a different project range.

Run:

    npm run typecheck

Expected output: exit 0.

### 4. Consume hints in patch derivation

Extend projectChangeToRoomPatch to accept an optional hint:

- retain all existing shape, palette-prefix, bounds, and capacity validation;
- when the hint is complete cells, inspect only the listed pixel/tile locations and derive their final palette values from the after project;
- deduplicate locations before constructing the bounded patch;
- when the hint is palette-only, avoid scanning pixels while preserving the existing palette identity rules;
- when the hint is unknown or absent, execute the current full-project scan unchanged.

The optimized path may trust hints produced by the store only after it verifies that the project shape and referenced IDs are compatible. Do not use a hint to hide a structural change. Keep null as the signal for snapshot mode where the existing protocol expects it.

Update every roomClient call to pass the hint, including local flush and any optimistic rebase path that derives a patch. Do not alter applyRoomPatch's full-project clone in this plan.

Run:

    npm run build
    git diff --check

Expected output: build exits 0 and diff check has no output.

### 5. Review correctness and measure the intended complexity change

Trace:

1. One-cell setColorAt visits one coordinate plus fixed validation, not every project cell.
2. A coalesced stroke visits the deduplicated stroke set once.
3. A tile edit does not trigger a sprite-pixel walk.
4. A transform or structural change still falls back to snapshot/full derivation.
5. A coalesced change with incomplete metadata deliberately falls back rather than emitting a partial patch.
6. Palette additions preserve the existing hex identity and prefix behavior.
7. A retry after welcome or room error uses metadata belonging to the current before/after projects.

Use source inspection and, if convenient, a temporary non-committed benchmark harness; do not add benchmark artifacts to the repository. The final code should make the optimized branch visibly separate from the existing safe fallback.

## Test plan

Automated test authoring is deferred. Later tests should compare hinted and full-scan patches for every covered mutation, verify coalescing unions and unknown fallback, exercise all-frames and tile operations, and benchmark one-cell edits on a near-limit project. Browser QA should inspect agent edits and pointer strokes because both must use the same store metadata path.

## Done criteria

- ProjectChange can carry a complete touched-cell/tile hint without adding a wire field.
- Ordinary pixel and tile mutations emit complete hints; unsupported or uncertain mutations explicitly use the fallback.
- Coalescing preserves a correct union or intentionally drops to unknown.
- projectChangeToRoomPatch uses the hint path for complete edits and retains the existing full scan otherwise.
- roomClient passes current hints on flush/retry, and no partial patch can be emitted from incomplete metadata.
- npm run typecheck, npm run lint, npm run build, and git diff --check pass.
- The final diff is limited to Scope.

## STOP conditions

Stop and report if:

- a mutation path cannot provide complete coordinates and cannot safely mark itself unknown;
- hint metadata would require changing the RoomPatch wire contract;
- store commit/coalescing changes would break undo history or cause direct project mutation;
- the optimized path cannot preserve palette identity, bounds, or structural checks;
- source inspection shows a covered operation still performs a full scan on the hot path;
- verification exposes an unrelated baseline failure.

## Maintenance notes

Treat hints as an optimization with a correctness escape hatch. New mutating store actions must either emit complete metadata or explicitly choose unknown; never silently assume that an omitted hint describes a no-op. Keep the full-scan implementation until equivalent coverage is proven.
