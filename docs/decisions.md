# Architecture decisions

## ADR 001 · One Next.js application

**Status** Accepted

Use the latest stable Next.js App Router with strict TypeScript. Route Handlers expose the REST API alongside the UI in one repository and one deployment. Handlers parse and validate input, call services, and translate results into HTTP responses. Services own business logic and repositories own data access. Share Zod schemas and inferred types through `src/shared`.

ESLint checks static imports across the client and server boundary. Keep dynamic imports within the same layer rules. The database adapter at `src/server/db/prisma.ts` constructs the singleton and imports the Prisma implementation. Repositories are its only application-layer consumers. Keep Prisma-specific types inside the persistence boundary.

React and React DOM supply the Next.js runtime. TypeScript declaration packages and `eslint-config-next` support strict checks and the framework lint rules.

## ADR 002 · PostgreSQL and Prisma

**Status** Accepted

PostgreSQL provides relational constraints and transactions for boards, columns, cards, and activity history. Prisma provides typed queries and versioned migrations. Phase 0 defines only the generator and datasource. Docker Compose supplies the local database, and Neon supplies the deployed database.

The npm registry tags Prisma 8 as a release candidate. Use stable Prisma 7.10.1 and its ESM-first `prisma-client` generator. The Prisma PostgreSQL adapter and `pg` support the Node.js runtime. `dotenv` loads `.env` for the standalone Prisma CLI. Generate the client with `npm run db:generate` before typechecking a fresh checkout. Runtime startup validates `DATABASE_URL`, `JWT_SECRET`, and `NODE_ENV` from the Next.js configuration during the development and production server phases. [Prisma PostgreSQL connector](https://www.prisma.io/docs/orm/v7/overview/databases/postgresql) · [Prisma 7 setup](https://www.prisma.io/docs/v7/prisma-orm/quickstart/prisma-postgres)

The npm lockfile pins the Prisma CLI's transitive `effect` dependency to a patched version via a scoped override. [Effect advisory](https://github.com/advisories/GHSA-7589-6fvf-x4pw)

## ADR 003 · Session authentication and request security

**Status** Accepted

Use `jose` for JWT sessions in an HttpOnly, Secure, SameSite cookie and `bcrypt` to hash passwords. Protect application routes, validate and sanitize untrusted input, and rate-limit requests. The assignment requires one authenticated user model.

## ADR 004 · Real-time transport and deployment

**Status** Accepted for a later phase

Use Server-Sent Events for server-to-client board updates and REST for mutations. Place an in-memory bus behind the EventBus interface so Redis or PostgreSQL LISTEN/NOTIFY can replace it if deployment expands to multiple processes. Run one Node.js process on a Render free web service, backed by Neon. Use `/api/health` for liveness checks and the keep-alive pinger. The endpoint performs zero database calls.

## ADR 005 · Server state and card ordering

**Status** Accepted for a later phase

Use TanStack Query for optimistic mutations, rollback, and reconciliation with server updates. Use dnd-kit core, sortable, and utilities for card movement. Use fractional indexing to insert a card between neighbors with a single ordering-key update in the normal case. Keep the UI responsive for desktop and tablet and support filters for assignee, priority, and search.

## ADR 006 · Verification and scope

**Status** Accepted

Use npm with a committed lockfile, Vitest for unit and API integration coverage, and GitHub Actions for lint, typecheck, and tests on pushes and pull requests. Phase 0 establishes tooling and module boundaries. Subsequent phases cover the required Kanban workflows and activity history.

## ADR 007 · Fractional ordering

Store fractional-indexing keys as text with PostgreSQL `COLLATE "C"` so
database ordering matches ordinal key comparison. The migration declares
the collation on both position columns. Unique indexes protect positions
within a board's columns and within a column's cards. Services calculate
keys from current neighbors inside the board write transaction.

## ADR 008 · Deletion and activity history

PostgreSQL cascades board deletion to memberships, columns, cards, and
activity. Column deletion cascades to cards. Card and column links on
activity use SET NULL, so snapshot details in JSON remain available.
User deletion cascades memberships and clears card assignments. RESTRICT
protects board ownership and the actor on retained activity.

## ADR 009 · Board search and integrity

Repositories use parameterized ILIKE on card titles and descriptions,
scoped to a board. Literal substring matching over board-scoped candidates
is adequate at assignment scale. Services validate that an assignee is a
board member and that a card's column belongs to the card's board inside
the write transaction.

## ADR 010 · Session lifetime

Use one signed JWT in an HttpOnly cookie with a seven-day expiry and no
refresh token. Logout clears the browser cookie. A copied token remains
usable until expiry while its user exists and the signing secret is valid.

## ADR 011 · Passwords and authentication requests

Hash passwords with bcrypt cost 12 and reject inputs over 72 UTF-8
bytes. Login uses the same 401 message for a missing account and a
wrong password, including a cost-12 dummy comparison for missing
accounts. Authenticated API handlers call `requireUser` and look up
the user behind the HS256 session. Page redirects use the same session
lookup. The shared HTTP wrapper rejects a present Origin with a host
that differs from the request host. Session cookies use SameSite=Lax,
and HttpOnly. In production the cookie uses Secure and a __Host- name.

Auth rate limits use fixed windows in memory for a single Render
instance. Counts reset on process restart. Multiple instances would
require a shared store implementing the limiter interface. On Render,
the application trusts the Cloudflare ingress to overwrite
CF-Connecting-IP and assumes the service is reachable only through that
ingress. Requests without a trusted IP share a fallback bucket.

Registration returns 409 for an existing email. We accept account
enumeration on registration for clearer feedback. Login returns the same
generic 401 for unknown emails and wrong passwords.

## ADR 012 · Board access, deletion, and limits

Services require membership for board-scoped actions. Missing and
inaccessible resources both return the same 404 response. Any member
can edit. Board deletion requires ownership and returns 403 for
other members. A column with cards returns 409 on deletion so the
user can move or delete its cards first.

Limits are 20 boards per owner, 12 columns per board, 500 cards per
board, and 20 members per board. Exceeding a limit returns 409.
An owner row lock serializes board creation. A board row lock
serializes board mutations so count checks, mutations, and activity
writes share one transaction.

## ADR 013 · Concurrent ordering and events

A move first checks that the requested neighbors are adjacent in the
destination, excluding the moving item. After taking the board lock,
it reloads the destination. If an overlapping mutation inserted items
between the same unchanged anchors, the move inserts immediately
before the original right anchor or appends when that anchor is
open-ended. When two users drop cards into the same valid gap at
the same time, the second committed card lands immediately behind
the first. This deliberately shifts the second drop by one place so
both moves can succeed. Missing or changed anchors and an initially stale gap
return `409 STALE_ORDER`. Unique position conflicts are retried up
to three times with fresh reads.

Activity is written in the mutation transaction. Services publish
events after commit and log delivery failures without failing the
request. An optional `X-Client-Id` UUID is included as
`originClientId` so subscribers can recognize their own changes.
Absent or invalid values become null. This header carries no
authorization information. The bus is in memory and scoped by board.

## ADR 014 · Board event streams and reconnect recovery

A dynamic Node Route Handler at `GET /api/boards/[boardId]/events`
streams board-scoped events with SSE.
Cookie authentication and board membership gate admission. Every
protected frame checks membership before delivery. An idle recheck
runs every 60 seconds. The deletion signal contains only the board
ID and terminates the subscription. Abort, cancellation, expiry,
rotation, and slow consumers release the admission slot.

Allow three concurrent streams per user and 100 per Node process.
At capacity, return 429 with `Retry-After: 10`. Bound
pending frames and the response buffer, and close slow consumers so
they can recover via a snapshot. Send heartbeat comments every 15
seconds to keep intermediaries active. Keep the external health
pinger for Render Free. Rotate streams after 55 minutes or at session
expiry, whichever comes first.

Refresh the board snapshot on each successful connection. A Last-Event-ID replay
buffer would require gap detection and still need snapshot recovery
after a restart. The client applies ordered DTO updates to the detail
cache and coalesces reconciliation fetches when state is uncertain.
On a terminal stream error, probe the board snapshot. A 200 reopens
the stream. A 401 stops recovery and notifies the UI to request sign-in.
A 404 stops recovery and removes the board from the cache. Network
errors, 429, and 5xx responses retry with jittered exponential backoff
from a one-second base, capped at 30 seconds. Repeated stream
rejections also back off even when the snapshot remains readable.
A successful stream open resets the backoff. Verify Render ingress
buffering after deployment.

The bus is shared across route bundles within one process. Multiple
instances would need shared pub/sub and deployment-wide accounting if
the connection cap must apply across instances. PostgreSQL
LISTEN/NOTIFY would use a dedicated direct connection and compact
notifications or event references.

## ADR 015 · UI foundation and route groups

Use CSS Modules for component styles and a shared token file for
colors, typography, spacing, and controls. This keeps the small
component set easy to inspect without a utility framework or UI kit.
Use the system font and inline SVG only when it helps identify a
control or destination. The application has no icon library.

The `(auth)` route group holds login and registration. The `(app)`
route group provides a server-authenticated shell for the board pages.
Route groups do not change public URLs. API handlers continue to
enforce authorization independently.

The shared browser API client lazily creates one UUID per document
in module memory and sends it as `X-Client-Id` on mutations. The same
identity is available to the board subscription. Reloading starts
a new identity. The ID provides correlation and grants no access.

## ADR 016 · Board mutation results and card drafts

Mutation results go through the SSE reducer. After a successful API
operation, synthesize the equivalent board event from the response,
cancel in-flight detail queries, and apply the reducer to the current
cache. Refetch if the reducer cannot reconcile the event. This gives
the mutation response and its SSE echo the same idempotency and
ordering rules.

Dialog saves send only changed fields, measured against the normalized
values when the card opened. This preserves concurrent changes to fields
the user did not edit. A no-op save sends no request. A deleted card
cannot be saved, and a card deletion that returns 404 is applied locally
as a deletion.

## ADR 017 · Optimistic card drag and drop

The board keeps an ordered list of card IDs per column while dragging.
Only a changed drop slot updates this preview. Live events still
update the query cache. Rebuild the preview from the latest board and
reapply the active slot after a live change. Cancel if the active
card or its destination disappears. A separate overlay renders the
dragged card. Keep presentation memoized inside each sortable wrapper.

On drop, derive the intended neighbors from the preview and skip an
unchanged move. Cancel the board fetch, read the latest card and
neighbors, and write one optimistic position while preserving the
card's timestamp. Submit the neighbor IDs to the server. If the
neighbors cannot define a valid position, skip the optimistic write
and reconcile from a fresh snapshot.

Use the same event reducer for the response and SSE echo so either
can arrive first. Equal timestamps with conflicting data trigger a
refetch. On failure, roll back only the ordering fields and only
while the cached card still matches the optimistic location and
original revision. This also protects a newer event at the same
position. Reconcile conflicts, missing cards, and ambiguous transport
failures with the server. Keep only the moving card unavailable
while its request is pending, and clear the preview on every exit.

Use a dedicated keyboard handle to keep editing and dragging
independent. Pointer and touch interactions use separate activation
rules. Measure production drag scripting, long tasks, card renders,
and cache writes on a board with at least 150 cards.

## ADR 018 · Client-side board filters

Filter the cached BoardDetail, which is bounded at 500 cards and kept
current by SSE. This supersedes the server-side ILIKE approach in
ADR 009. Filtering responds immediately to board changes and needs no
endpoint or extra query key. The board and assignee and board and
priority indexes remain available for future server queries. This UI
does not use them.

Store assignee, priority, and search text as assignee, priority, and
q in the URL. Assignee also accepts unassigned. Ignore invalid values.
Use router replacement without scrolling so changing filters does not
add history entries. Match all normalized search terms across title
and description.

Disable card dragging while any filter is active. Visible neighbors
can have hidden cards between them in the full column, so they cannot
safely describe a server drop slot. Editing and adding cards remain
available.

If the active card or its destination disappears, or a filter turns
on during the drag, replace the keyed DndContext and discard the local
preview. Guard callbacks by the context generation so a late drop
from the old interaction cannot submit a move.

## Activity history

Activity uses keyset pagination on creation time and ID, both descending,
through the existing board activity index. The ID breaks ties when several
entries share a timestamp. The API returns structured snapshots and actor
names, and the browser formats the entries. Member-added snapshots retain
the added member’s email because board members can already see it in the
members list. Actor email is excluded from the actor object.

While the panel is open, board-detail changes schedule a first-page refresh
after 500 ms. Previously loaded entries and the tail cursor are preserved.
The refresh keeps entries displaced from the first page when the fresh
page overlaps the loaded history. A burst larger than the first page
between refreshes can leave a gap until a new pagination session starts.

## Browser security headers

The catch-all Next.js header policy allows inline scripts for Next.js
bootstrap and inline styles for component positioning. Nonce-based CSP
would require per-request nonce propagation and dynamic rendering for
otherwise static pages. Production excludes eval and sends HSTS without
subdomain or preload directives. Browser schemas disable Zod’s
generated parser so validation works with eval blocked. API JSON
responses default to no-store through the handler, while SSE retains its
stream-specific cache policy.

## Protected API limits

The authenticated user lookup applies independent fixed-window quotas of
120 mutations and 600 reads per user per minute. SSE uses its existing
connection admission controls. The limiter uses process-local memory,
so multiple instances would need a shared implementation. A rate-limited
move rolls back and shows the retry delay returned by the API.

## JSON request bounds

The reader counts UTF-8 bytes while streaming and rejects bodies above
64 KiB before parsing. It also rejects more than 32 nested containers.
Oversized bodies use 413, unsupported media types use 415, and invalid
UTF-8 or JSON uses 400. Unexpected errors use a generic 500 response.

## Production dependency audit

The Phase 10 production dependency audit reported zero vulnerabilities.

## Render and Neon deployment

Render Free provides a build command and a start command. Run committed
migrations during the build because pre-deploy commands require a paid
web service. Migration failure prevents rollout. Builds operate on the
same database the currently deployed service may still use, so migrations
must be compatible with that running version. Use one Node instance in
the same geography as Neon.

Use Neon's pooled URL at runtime and its direct URL for migration deploy.
The runtime pg pool defaults to five connections, 30 seconds idle, and
15 seconds to connect. The small pool bounds per-process connections,
while the connection timeout allows compute wake-up and TLS setup.
Interactive transactions give acquisition up to 20 seconds and execution
up to 15 seconds to cover connection acquisition and short board-lock
contention. All `FOR UPDATE` queries and writes use the same
transaction-bound client. Transaction pooling pins the backend until
commit or rollback, when Postgres releases the locks.

On SIGTERM the app ends open SSE responses and releases admission slots.
Next.js handles HTTP shutdown and process exit. A reconnect fetches the
latest board snapshot.


## Render client IP fallback

Render’s public Cloudflare ingress overwrites `CF-Connecting-IP` and
appends to `X-Forwarded-For`. With `RENDER=true`, prefer a valid
`CF-Connecting-IP` and use only the final forwarded address as fallback.
A malformed final entry falls back to the shared bucket. Earlier entries
may come from the caller. Outside Render both headers are ignored.
This assumes the service receives traffic exclusively through Render’s
public ingress. [Render’s trusted proxy guidance](https://render.com/articles/host-pocketbase-on-render)
