# Plan 013: Share permalink + `import_project` agent tool

> **Executor instructions**: Follow this plan step by step. Run every verification
> command and confirm the expected result before moving on. Touch only the files
> listed as in scope. If any STOP condition occurs, stop and report. Do not
> improvise. Commit per the git workflow section. SKIP any instruction to update
> `plans/README.md` — your reviewer maintains the index.

## Status

- **Priority**: P3 (direction)
- **Effort**: M
- **Risk**: MED (boot-order interaction with localStorage hydration; URL length for
  big projects)
- **Depends on**: plans/004 (sanitizeProject + result-returning `loadProject`) —
  HARD dependency; plans/001, 003
- **Category**: direction
- **Planned at**: commit `78aad52`, 2026-08-26 (historical branch plan; reapply to the current checkout)

## Why this matters

The serialization pair already exists — `exportProject()` (store) and
`loadProject()` (store, sanitized and result-returning after plan 004) — but it's
half-open: humans can only share by downloading a JSON file, and the agent has
`export_project` but no import counterpart (its own description points humans at a
manual file flow). A `#p=<encoded>` permalink means a judge clicks a link and lands
inside a finished co-created artwork with zero setup — the strongest possible
ten-second demo of the human+agent concept. `import_project` lets an agent
snapshot/restore/branch canvas state mid-session, showcasing WebMCP leverage.

## Current state

- `src/store/projectStore.ts` — `exportProject(): string` returns
  `JSON.stringify(project, null, 2)`; `loadProject(p: unknown): { ok: true } |
  { ok: false; error: string }` sanitizes and commits (post-004 shape — verify
  before starting; if 004 has not landed, STOP, it is a hard dependency).
- `src/webmcp/registerTools.ts` — `export_project` tool returns
  `{ ok, filename, json }`. Tools are registered in the `tools` array via
  `defineTool`.
- `src/App.tsx` — mount effects; the store is created at module import time in
  `projectStore.ts` (hydrating from localStorage via `loadStored()` in the
  initializer). A permalink must be applied AFTER mount (loadProject commits over
  the hydrated state) — a mount effect in `App` is the right seam.
- `src/components/SpritesPanel.tsx` — the `io-details` block ("Project file")
  holds Save JSON / Import / Reset buttons; the share button belongs there.
- `src/engine/` convention: pure helpers, no DOM except where noted
  (`exportImage.ts` uses `document` — so light DOM use in engine is tolerable, but
  base64 coding needs only `btoa`/`atob` + `TextEncoder`, available everywhere).

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Typecheck | `npm run typecheck` (or `npx tsc -b --pretty false`) | exit 0 |
| Lint | `npm run lint` | exit 0 |
| Build | `npm run build` | exit 0 |
| Dev smoke | `npm run dev` + curl title check (kill server after) | boots clean |

## Scope

**In scope**:
- `src/engine/share.ts` (create — encode/decode helpers)
- `src/App.tsx` (permalink hydration effect)
- `src/components/SpritesPanel.tsx` ("Copy share link" button)
- `src/webmcp/registerTools.ts` (`import_project` tool; update `export_project`'s
  description which currently references the manual flow)
- `README.md` (table rows for `import_project`; a "Share links" sentence)

**Out of scope**:
- Compression (no new deps; base64url of the minified JSON only).
- History-API routing; the hash is never read by the router because there is none.
- Auto-updating the hash as the user draws (only explicit Copy produces a link).

## Git workflow

- Branch: `advisor/013-share-permalink`, branched on the approved head.
- One commit: `feat: share permalinks and import_project agent tool`.

## Steps

### Step 1: Create `src/engine/share.ts`

```ts
export function encodeProjectToHashParam(json: string): string {
  const bytes = new TextEncoder().encode(json);
  let bin = "";
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function decodeProjectFromHashParam(param: string): unknown | null {
  try {
    const b64 = param.replace(/-/g, "+").replace(/_/g, "/");
    const bin = atob(b64 + "=".repeat((4 - (b64.length % 4)) % 4));
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    return null;
  }
}

export function projectHashFromJson(json: string): string {
  return `#p=${encodeProjectToHashParam(JSON.stringify(JSON.parse(json)))}`;
}
```
(`projectHashFromJson` re-stringifies without pretty-printing to shrink the URL.)

**Verify**: `npx tsc -b --pretty false` → exit 0.

### Step 2: Permalink hydration in `App.tsx`

Add a mount effect (before/alongside the existing registration effect):
```ts
useEffect(() => {
  const m = location.hash.match(/^#p=(.+)$/);
  if (!m) return;
  const parsed = decodeProjectFromHashParam(m[1]);
  if (!parsed) return;
  const result = useStore.getState().loadProject(parsed);
  if (!result.ok) console.warn("[share] ignoring bad permalink:", result.error);
}, []);
```
Import `decodeProjectFromHashParam` and `useStore`.

**Verify**: `npx tsc -b --pretty false` → exit 0.

### Step 3: "Copy share link" button in SpritesPanel

Inside the `io-details` `.panel-row.wrap`, add before the Import button:

```tsx
<ShareButton />
```
with a local component in the same file:
```tsx
function ShareButton() {
  const [copied, setCopied] = useState(false);
  return (
    <button
      className="text-btn"
      onClick={async () => {
        const st = useStore.getState();
        const hash = projectHashFromJson(st.exportProject());
        const url = `${location.origin}${location.pathname}${hash}`;
        try {
          await navigator.clipboard.writeText(url);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch {
          alert(`Share link (copy manually):\n${url}`);
        }
      }}
    >
      {copied ? "Copied!" : "Share link"}
    </button>
  );
}
```
(Add the `useState` import to the file if missing.)

**Verify**: `npx tsc -b --pretty false` → exit 0.

### Step 4: `import_project` tool + `export_project` copy fix

In `registerTools.ts`, after `export_project`:

```ts
defineTool<{ json: string }>({
  name: "import_project",
  title: "Import project JSON",
  description:
    "Replace the current project with one previously exported via export_project (or a project file). The JSON is sanitized and validated; the human sees the imported project immediately.",
  inputSchema: {
    type: "object",
    properties: {
      json: { type: "string", description: "Full project JSON string" },
    },
    required: ["json"],
  },
  execute: ({ json }) => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(json);
    } catch {
      return { ok: false, error: "json is not parseable JSON" };
    }
    const result = useStore.getState().loadProject(parsed);
    log("import_project", result.ok ? "imported" : "rejected");
    return result.ok
      ? { ok: true }
      : { ok: false, error: result.error };
  },
}),
```

Also update `export_project`'s description: replace
"re-imported via Sprites > Project file > Import, or saved by the user" with
"re-imported via the import_project tool, the Sprites > Project file > Import
button, or a share permalink".

**Verify**: `npm run lint && npm run typecheck && npm run build` → all exit 0.

### Step 5: README + smoke

- README: add `import_project` row to the tool table (bump count), and one sentence
  in "What humans and agents can do together": "Share links (`#p=…` permalinks) let
  anyone open a co-created project with one click."
- Smoke: `npm run dev & sleep 3 && curl -s http://localhost:5173 | grep -o "<title>[^<]*"`;
  kill the server (`pkill -f vite || true`).

**Verify**: gates exit 0; server boots.

## Test plan

None — maintainer deferred tests. Reviewer verifies live: copy a share link in the
browser, open it in a fresh tab, confirm the project hydrates; call
`import_project` with `export_project`'s output via `executeTool`.

## Done criteria

- [ ] `grep -n "decodeProjectFromHashParam" src/App.tsx` → hydration effect
- [ ] `grep -n "Share link" src/components/SpritesPanel.tsx` → button present
- [ ] `grep -n "import_project" src/webmcp/registerTools.ts` → tool registered
- [ ] Round-trip sanity: `node -e "const {execSync}=require('child_process');"` is
      NOT required — instead verify by inspection that `decode(encode(x))`
      preserves JSON (the helpers are symmetric by construction; reviewer may spot-
      check in browser).
- [ ] Gates exit 0; diff limited to the five in-scope files

## STOP conditions

- `loadProject` does not return a result object (plan 004 not landed) — STOP, hard
  dependency.
- The encoded URL for the STARTER project exceeds ~30,000 characters (indicates a
  bug — the starter project is small; re-check that you re-stringified minified).

## Maintenance notes

- Permalinks intentionally win over localStorage on load (they commit over the
  hydrated state) but do NOT clear the hash — refresh re-applies the same project.
  If a user starts editing, their edits autosave over it; the hash stays stale
  until they copy a new link. Acceptable; document if it ever confuses.
- If projects grow large (many 64×64 sprites), consider LZ compression behind the
  same interface — `share.ts` is the only file to change.
