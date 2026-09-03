# Plan 023: Surface local persistence health and provide recovery backups

> Executor instructions: make local autosave failures visible and actionable while preserving the current localStorage format and in-memory project behavior. This is a plan-only artifact; implement only the files in Scope when executing it. The repository already contains intentional uncommitted changes, so use the drift check as a comparison aid rather than treating any dirty state as a blocker.

## Status

- Priority: P1
- Effort: M
- Risk: MED
- Depends on: plans/004-sanitize-project-json.md
- Category: bug / reliability / user experience
- Planned at commit: b36fad5
- Planned at: 2026-09-03

## Why this matters

The project store advertises that work is autosaved locally, but scheduleSave silently returns when the serialized project is over the 4 MB limit and silently catches localStorage errors. This includes quota exhaustion, unavailable storage, and private-mode behavior. The edits remain in memory, so a reload can restore an older project or the starter project with no warning.

Users need to know whether the current canvas is durably stored and need a one-click way to download the current project when local persistence is unhealthy. The recovery path must not assume that a second localStorage write will succeed.

## Current state

The relevant behavior is:

- src/store/projectStore.ts:278-288 debounces save, serializes the project, returns silently for oversized JSON, and catches localStorage failures without updating observable state.
- src/store/projectStore.ts:76-105 defensively handles invalid primary storage only during load.
- src/store/projectStore.ts:298 initializes storageRecovery from a prior invalid-storage recovery path; it does not represent a failed save.
- src/components/StatusBar.tsx:29-43 shows a recovery notice only when storageRecovery exists.
- src/components/ProjectMenu.tsx:363-366 tells the user that the project is autosaved locally regardless of the latest save result.

The project export/download action already exists in the application, so the UI should reuse that serialization/download path rather than create a second project format.

## Drift check

Run:

| Check | Command | Expected interpretation |
| --- | --- | --- |
| Committed drift | git diff --stat b36fad5..HEAD -- src/store/projectStore.ts src/components/StatusBar.tsx src/components/ProjectMenu.tsx | Empty or explainable branch commits |
| Working-tree drift | git diff --stat b36fad5 -- src/store/projectStore.ts src/components/StatusBar.tsx src/components/ProjectMenu.tsx | Expected to show active implementation changes |
| Save paths | rg -n "scheduleSave|localStorage|storageRecovery|Autosaved locally|exportProject|download" src/store/projectStore.ts src/components/StatusBar.tsx src/components/ProjectMenu.tsx | Confirm the current write, status, and export paths |

If an observable save-status model already exists, preserve it and verify the failure cases below instead of adding a duplicate status field.

## Commands

Run from the repository root:

| Purpose | Command | Pass condition |
| --- | --- | --- |
| Typecheck | npm run typecheck | Exit 0 |
| Lint | npm run lint | Exit 0; the known CanvasStage dependency warning may remain |
| Production build | npm run build | Exit 0 |
| Patch hygiene | git diff --check | No output |
| Persistence-path review | rg -n "storageStatus|storageError|MAX_PROJECT_JSON_LENGTH|localStorage.setItem|download" src/store/projectStore.ts src/components/StatusBar.tsx src/components/ProjectMenu.tsx | Shows visible status transitions and a backup action |

## Scope

Only edit:

- src/store/projectStore.ts
- src/components/StatusBar.tsx
- src/components/ProjectMenu.tsx

Do not migrate to IndexedDB, add a durable room outbox, change the project JSON schema, or make a save failure reject an otherwise valid in-memory edit. Do not store a recovery copy in another localStorage key as the primary fallback; quota and unavailable-storage failures can affect that key too. Automated tests are deferred by the maintainer.

## Git workflow

Use a focused branch such as advisor/023-local-persistence-health if needed. Make one conventional commit, for example fix(storage): surface autosave failures. Do not push without separate operator authorization.

## Steps

### 1. Add an observable persistence-health state

Extend the project store state with a small explicit status model, for example:

- not_saved or unknown before the first successful write;
- pending while a debounced save is waiting;
- saved after a successful write;
- unavailable after localStorage access or quota failure; and
- too_large when the serialized project exceeds MAX_PROJECT_JSON_LENGTH.

Keep the existing storageRecovery field for invalid data recovered during startup. Do not overload it with save failures because its current UI and recovery-string semantics are different. Include a short storageError or equivalent user-facing detail and, if useful to the UI, lastSavedAt.

Initialize the status consistently for both a project loaded from localStorage and a starter project. A loaded project may begin as saved; a starter project should not claim a successful save until a write succeeds. Make status updates non-persistent store state so changing the status does not recursively schedule another save.

Run:

    npm run typecheck

Expected output: exit 0.

### 2. Make every scheduled-save outcome observable

Update scheduleSave so it:

- marks the state pending when a save is scheduled;
- serializes the exact project that is about to be written;
- marks too_large with an actionable detail and returns when the serialized length exceeds the existing limit;
- marks saved only after localStorage.setItem succeeds; and
- catches localStorage access, quota, and serialization failures, marks unavailable, and retains the current in-memory project.

Do not clear the last good saved status until the new write succeeds or a failure is explicitly recorded. Do not show a success status before setItem returns. Ensure a later successful edit/save can recover from unavailable or too_large back to saved.

Preserve the existing debounce and localStorage key. If serialization itself can fail for a malformed in-memory object, record that as unavailable/failed rather than throwing from a timer.

Verify:

    npm run lint

Expected output: exit 0 with at most the existing warning.

### 3. Add a current-project backup action to the visible warning

Update StatusBar to render a compact, accessible status for pending, saved, unavailable, and too_large states. For unavailable and too_large:

- clearly say that the latest edits are not safely autosaved locally;
- include the relevant reason without exposing implementation jargon;
- offer a Download backup action that serializes the current project through the existing export path;
- keep the current invalid-storage recovery notice working independently.

The backup action must be available even when localStorage is full or unavailable. It should not depend on reading from localStorage. Use a button with a visible label and an appropriate status/alert role; do not make the warning disappear merely because the user opened the menu.

### 4. Correct the autosave claim in ProjectMenu

Replace the unconditional “Autosaved locally” hint with status-aware copy. It may say autosaved locally only after a successful write. Pending should communicate that a save is in progress, and unavailable/too_large should point to the visible backup action or offer the same download action if the menu is the more discoverable location.

Keep project export/import behavior and menu layout otherwise unchanged. Avoid duplicating a second serializer or changing the file format.

Run:

    npm run build
    git diff --check

Expected output: build exits 0 and diff check has no output.

### 5. Review failure and recovery transitions

Trace these cases:

1. A normal edit schedules a save, then a successful setItem yields saved.
2. A project over MAX_PROJECT_JSON_LENGTH remains visible in memory and yields too_large with a working backup download.
3. localStorage.setItem throws a quota/security error; the status becomes unavailable and no timer throws.
4. Storage fails once and succeeds on a later edit; the status returns to saved.
5. Startup recovery from invalid JSON still exposes its existing recovery data and is not overwritten by a later save-status update.
6. Reload after a failed save does not falsely claim that the unsaved project was recovered.

## Test plan

Automated test authoring is deferred. Later tests should mock localStorage for quota/security failures, exercise the size boundary, verify status transitions after debounce, and confirm the download action uses the current in-memory project. Browser QA should test private-mode or disabled-storage behavior and verify that the backup downloads even when writes fail.

## Done criteria

- The store exposes a distinguishable status for pending, saved, unavailable, and too-large saves.
- scheduleSave records every failure instead of silently returning or swallowing it.
- The UI never claims autosaved locally until a write has succeeded.
- Unavailable and too-large states show an actionable current-project backup download.
- The existing invalid-storage recovery path remains intact.
- npm run typecheck, npm run lint, npm run build, and git diff --check pass.
- The final diff is limited to the three files in Scope.

## STOP conditions

Stop and report if:

- the existing export path cannot serialize the current project without changing the persisted format;
- a status update would mutate project data or create a save loop;
- the only proposed backup depends on localStorage succeeding;
- adding the warning requires changing room or authentication state outside Scope;
- verification exposes an unrelated baseline failure that cannot be isolated.

## Maintenance notes

Keep persistence health separate from room connectivity and startup recovery. Any future durable storage backend should implement the same observable outcomes and should not remove the explicit backup path.

