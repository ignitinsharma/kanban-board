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

**Status** Accepted for a later phase

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
