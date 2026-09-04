# Plan 019: Define room access policy and add production abuse guardrails

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the next
> step. If anything in the "STOP conditions" section occurs, stop and report — do
> not improvise. Modify only the files in Scope. Update this plan's status row in
> `plans/README.md` when complete unless a reviewer maintains the index.
>
> **Drift check (run first)**: `git diff --stat 78aad52..HEAD -- partykit/server.ts src/realtime/roomClient.ts wrangler.jsonc README.md` and
> `git diff --stat 78aad52 -- partykit/server.ts src/realtime/roomClient.ts wrangler.jsonc README.md`.
> The second command includes unstaged changes. If the Current state excerpts do
> not match the live code, stop and refresh the plan.

## Status

- **Priority**: P1 before public deployment; P3 for a local/demo-only room server
- **Effort**: M
- **Risk**: MED (limits and origin policy can reject legitimate collaborators)
- **Depends on**: plans/014-reliable-room-outbox.md, plans/016-bounded-room-operations.md
- **Category**: security / direction
- **Planned at**: commit `78aad52`, 2026-08-26

## Why this matters

The current room is intentionally easy to share, but the room ID is effectively
the only credential. Anyone holding or guessing a room URL can join and edit;
client-provided identity fields are accepted for presence; and the worker enables
broad CORS. There is no connection cap or message-rate budget. That is a valid
prototype tradeoff, but it must be explicit before a public deployment so the
team does not mistake a demo room for an authenticated collaboration service.

This plan keeps bearer-link rooms as the documented prototype mode, strengthens
room-ID entropy and basic abuse limits, restricts cross-origin access to an
explicit configured origin where the PartyServer API supports it, and leaves a
clear seam for real authentication. It does not invent an identity provider or
pretend that a client-supplied name is authentication.

## Current state

- `src/realtime/roomClient.ts:184-187` creates a short predictable-looking room
  name using `Math.random()`:
  ```ts
  createRoom(): string {
    const room = `tiny-${Math.random().toString(36).slice(2, 8)}`;
    this.joinRoom(room);
    return room;
  }
  ```
- `partykit/server.ts:146-173` derives `clientId`, name, and color from connection
  query parameters and stores them as presence. These are display fields, not
  verified identity.
- `partykit/server.ts:224-249` accepts any valid project as the initial room state;
  `partykit/server.ts:265-305` accepts edits from every ready connection. There is
  no authorization layer.
- `partykit/server.ts:180-201` caps each message at 4,000,000 string characters and
  validates JSON/project shape, but there is no per-connection or per-room rate
  limit and no maximum connection count.
- `partykit/server.ts:438-443` routes with `{ cors: true }`, allowing broad browser
  origins. The exact supported restrictive CORS configuration must be confirmed
  from the installed PartyServer version before changing it.
- `README.md:99-112` documents shared rooms but does not say that a room URL is a
  bearer credential or that there is no authentication.
- Conventions: all server inputs are untrusted; the server must validate before
  mutating Durable Object state; browser identity is useful for presence but must
  not be treated as authorization; deployment configuration belongs in
  `wrangler.jsonc`/environment variables rather than hard-coded production URLs.

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Typecheck | `npm run typecheck` | exit 0 |
| Worker typecheck | `npx tsc -p tsconfig.worker.json --noEmit --pretty false` | exit 0 |
| Lint | `npm run lint` | exit 0 |
| Build | `npm run build` | exit 0 |

## Scope

**In scope**:

- `src/realtime/roomClient.ts` — cryptographically strong room ID generation
  for newly created rooms.
- `partykit/server.ts` — connection/message rate budgets, connection cap, and
  explicit authorization-policy comments/config handling.
- `wrangler.jsonc` — non-secret room guardrail configuration if required by the
  worker implementation.
- `README.md` — bearer-link warning, prototype limits, and production auth note.

**Out of scope**:

- Selecting or implementing a user identity provider, login, OAuth, JWT, or
  organization permissions.
- Treating `clientId`, display name, or color as authentication.
- Encrypting project contents end-to-end.
- Changing project merge, outbox, patch, undo, or export semantics.
- Removing shareable links from the local/demo mode.

## Git workflow

- Branch: `advisor/019-room-access-guardrails`.
- Commit: `security: document bearer rooms and add abuse guardrails`.
- Do not push or open a PR unless explicitly instructed.

## Steps

### Step 1: Write the room threat model and policy into product documentation

Update the shared-room section of `README.md` to state plainly:

- a room URL is a bearer link; anyone with it can see/edit the room;
- names/colors are presence labels, not verified identity;
- prototype defaults are intended for trusted collaborators and small rooms;
- production deployments need authentication/authorization before private or
  sensitive artwork is shared;
- new rooms use high-entropy IDs, but old short IDs remain valid until an explicit
  migration/expiry policy exists.

Document the default limits selected in Step 2, including connection count,
operation/presence rate, and message size. Do not claim that CORS restriction is
authorization; it only limits browser origins.

**Verify**: `rg -n "bearer|authentication|rate|connection" README.md` → the
policy and limits are visible; no secret or token is documented.

### Step 2: Use strong IDs for new rooms

In `src/realtime/roomClient.ts`, replace `Math.random()` room suffix generation
with a Web Crypto source available in the browser. Prefer a UUID-derived compact
lowercase ID or another at-least-96-bit representation. Keep the existing
sanitization rules and `tiny-` display prefix if desired. Do not change the
meaning of an explicitly typed room name or invalidate existing shared links.

If the runtime lacks the required Web Crypto API, use a clearly documented
fallback only for local/demo operation and surface that limitation; do not claim
cryptographic entropy for the fallback.

**Verify**: `npm run typecheck` → exit 0; `rg -n "createRoom|Math\.random" src/realtime/roomClient.ts` confirms room creation no longer uses `Math.random()` as its entropy source.

### Step 3: Add bounded connection and message budgets on the worker

In `partykit/server.ts`, define named constants for small-room defaults, for example:

- `MAX_CONNECTIONS_PER_ROOM = 16`;
- `MAX_OPERATIONS_PER_WINDOW = 30` per connection per 10 seconds;
- `MAX_PRESENCE_PER_WINDOW = 120` per connection per 10 seconds;
- retain the existing 4,000,000-character maximum message size.

Use a per-connection state or equivalent in-memory counter with a monotonic/time
window. Before handling `hello`, reject a connection when the room has reached the
connection cap. Before handling `operation`, `undo`, or `redo`, consume the
operation budget; before handling `presence`, consume the presence budget. Send a
clear room error and close/reject only the abusive connection when a budget is
exceeded. Do not rate-limit the server's broadcasts or penalize other peers.

The hibernating Durable Object must not rely on a process-global counter that
mixes rooms or assumes one worker instance. Keep the budget attached to a
connection/room instance in a way supported by the installed PartyServer types.
If hibernation discards the required counter state, stop and report rather than
silently disabling the limit.

Use byte length for the message-size check if the runtime makes that practical;
otherwise retain the current character cap and document the distinction. Keep all
existing JSON/project validation and persistence rollback behavior.

**Verify**: `npx tsc -p tsconfig.worker.json --noEmit --pretty false && npm run lint` → both exit 0; inspect every inbound message branch to confirm the budget is applied before expensive parsing/merge work where feasible.

### Step 4: Make browser-origin policy explicit

Inspect the installed `partyserver`/`routePartykitRequest` API and configure an
explicit allowed origin for production if the API supports it. The development
configuration must continue to allow the documented local Vite origin. If the API
cannot express the required policy without a custom OPTIONS/upgrade handler,
STOP and report the supported migration instead of guessing at CORS options.

Do not use `Access-Control-Allow-Origin: *` together with credentials if the
client later gains cookies/tokens. Do not treat a restrictive origin as a
substitute for room authorization.

**Verify**: `npm run typecheck && npm run build` → both exit 0; the final worker
configuration has an explicit documented dev/prod origin policy or a written
STOP report for the missing PartyServer capability.

### Step 5: Review the public-room boundary

Read the complete diff and confirm:

1. Two trusted browser clients can still create/join a room and exchange edits.
2. A third connection is rejected only after the configured cap is reached.
3. Presence spam cannot consume the operation budget or block project edits from
   another connection.
4. A client cannot elevate itself from a display label to an authorized role.
5. Invalid/oversized messages are rejected before project mutation.
6. New room IDs do not reduce compatibility for existing links.
7. README clearly distinguishes prototype bearer links from authenticated rooms.

If browser tooling is available, smoke-test two clients with the configured
development origin. A true cross-origin test requires a second origin; report it
as outstanding if unavailable.

**Verify**: `git diff --check` → no output; `npm run lint && npm run typecheck && npm run build` → all exit 0.

## Test plan

Automated tests are deferred by the maintainer decision in `plans/README.md`.
When tests are introduced, prioritize pure rate-window tests and worker-level
cases for cap rejection, operation-vs-presence budgets, malformed messages, and
old room ID compatibility. Add an integration test once the deployment has a
real origin/auth configuration.

## Done criteria

- [ ] README explicitly describes bearer-link access and the lack of prototype
      authentication.
- [ ] New room IDs use the selected Web Crypto strategy; old links remain valid.
- [ ] Per-room connection and per-connection operation/presence budgets are
      enforced before expensive mutation work.
- [ ] Existing message-size/project validation and persistence rollback remain.
- [ ] CORS/origin behavior is explicitly configured or a supported limitation is
      documented without a false security claim.
- [ ] `npm run lint`, `npm run typecheck`, and `npm run build` exit 0.
- [ ] Only the files listed in Scope are modified.

## STOP conditions

- The product now requires private rooms or user-level permissions but no
  identity provider/authorization contract has been selected; stop and request
  that decision rather than building fake auth.
- PartyServer's hibernation model cannot safely retain the selected rate state;
  stop and report the runtime limitation.
- The installed route helper does not support restrictive CORS and implementing
  it requires replacing the WebSocket upgrade path; stop before writing a custom
  handler.
- Connection limits break the documented demo workflow at its expected scale;
  stop and request revised limits rather than silently raising them.

## Maintenance notes

- Rate limits are abuse guardrails, not authorization. Revisit them when rooms
  gain authenticated users, larger teams, or paid usage.
- If auth is added later, authorize room access on the server before `hello` and
  derive actor identity from the verified credential, not query parameters.
- Add room expiry/cleanup separately; Durable Object storage currently retains
  the latest project/history without a documented retention policy.
