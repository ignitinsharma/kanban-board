## Overview

## Architecture decisions

## Tech stack

## Database setup

Use Node.js 24 and run `npm ci`. Copy `.env.example` to `.env` and set
`POSTGRES_PASSWORD` and `DATABASE_URL`. For the default Compose port, use
`postgresql://kanban:<url-encoded-password>@127.0.0.1:5432/kanban`. Set
`JWT_SECRET` for the app as described in `.env.example`.

```sh
docker compose up -d --wait postgres
npm run db:migrate
npm run db:generate
```

Prisma 7.10.1 uses the root `prisma.config.ts` via `--config`. To author
a migration, run `npm run db:migrate -- --name <name> --create-only`,
review the SQL, and apply it with `npm run db:migrate`. Preserve the
explicit `COLLATE "C"` on both ordering columns if a later migration
recreates them. Both position keys are unique within their immediate
parent. Activity snapshots in JSON survive deletion of linked cards and
columns until the board is deleted.

## Local run

Run `npm run dev` after database setup. Visit `/register` to create an
account or `/login` to sign in. The home page requires a valid session.
Generate `JWT_SECRET` with `openssl rand -base64 48` and keep the same
value across restarts. Rotating it invalidates existing sessions.


## Testing

Run `npm test` after generating Prisma Client. To run the PostgreSQL suite,
create a disposable database in the local Compose server.

```sh
docker compose exec postgres createdb -U kanban kanban_test
export TEST_DATABASE_URL='postgresql://kanban:<url-encoded-password>@127.0.0.1:5432/kanban_test'
DATABASE_URL_UNPOOLED="$TEST_DATABASE_URL" npx prisma migrate deploy --config prisma.config.ts
DATABASE_URL_UNPOOLED="$TEST_DATABASE_URL" npx prisma migrate deploy --config prisma.config.ts
npm test
```

Use the port configured in `.env`. The second deploy should report zero
pending migrations. CI runs the same migration and test checks against a
fresh PostgreSQL 17 database.

## Deployment

Before the first production deployment, apply the committed migration on
a disposable Neon branch and run the PostgreSQL suite there. The initial
migration expects an empty database.

On Render, set `DATABASE_URL` to the pooled Neon URL and
`DATABASE_URL_UNPOOLED` to the direct Neon URL for the same database.
Set `JWT_SECRET` in Render's environment. Use this build command on
Render Free so migration failure stops the deployment before startup.

```sh
test -n "$DATABASE_URL_UNPOOLED" && npm ci --include=dev && npm run build && npx prisma migrate deploy --config prisma.config.ts
```

Set the start command to `npm start`.

## API overview

| Method | Path | Behavior |
| --- | --- | --- |
| POST | `/api/auth/register` | Accepts JSON email, name, and password. Returns the public user with status 201 and a session cookie. |
| POST | `/api/auth/login` | Accepts JSON email and password. Returns the public user with status 200 and a session cookie. |
| POST | `/api/auth/logout` | Clears the cookie and returns 204. Send an empty request. |
| GET | `/api/auth/me` | Returns the public user, or 401 without a valid session. |

The public user has `id`, `email`, and `name`. The session lasts seven
days. Login allows 10 attempts per 15 minutes per IP and per IP/email
pair. Registration allows five attempts per hour per IP. A limited
request returns 429 with `Retry-After` in seconds.

### Boards, columns, and cards

| Method | Path | Success response |
| --- | --- | --- |
| GET | `/api/boards` | 200, boards the current user belongs to |
| POST | `/api/boards` | 201, board detail with four default columns |
| GET | `/api/boards/[boardId]` | 200, board detail with members, ordered columns, and ordered cards |
| PATCH | `/api/boards/[boardId]` | 200, renamed board |
| DELETE | `/api/boards/[boardId]` | 204, owner only |
| POST | `/api/boards/[boardId]/members` | 201, public user added by email |
| POST | `/api/boards/[boardId]/columns` | 201, appended column |
| PATCH | `/api/columns/[columnId]` | 200, renamed column |
| PATCH | `/api/columns/[columnId]/move` | 200, reordered column |
| DELETE | `/api/columns/[columnId]` | 204, empty column removed |
| POST | `/api/cards` | 201, card appended to the supplied `columnId` |
| PATCH | `/api/cards/[cardId]` | 200, updated card |
| PATCH | `/api/cards/[cardId]/move` | 200, moved card |
| DELETE | `/api/cards/[cardId]` | 204, card removed |

Move requests provide `previousId` and `nextId`. Send `null` at either
end. Card moves also provide the destination `columnId`. Reload the
board before retrying a `409 STALE_ORDER`. A populated column returns
409 on deletion. Board, column, card, and member responses use public
fields and ISO timestamps where present.

Expect 400 for invalid input, 401 for missing authentication, 404 for
missing or inaccessible resources, 409 for conflicts and limits, and
422 for invalid assignments or move destinations. A member who tries
to delete a board they do not own receives 403.

### Board events

`GET /api/boards/[boardId]/events` opens a same-origin Server-Sent Events
stream for board members. It uses the session cookie. Missing and
inaccessible boards return 404. There are at most three streams per user
and 100 per Node process. At capacity, the endpoint returns 429 with
`Retry-After: 10`.

The stream sends typed board events and a comment every 15 seconds.
The client fetches the latest board detail on each connection.
A snapshot recovers the current state without retaining a replay buffer
or relying on Last-Event-ID across process restarts. If the native stream
closes permanently, the client probes the board endpoint. A 200 reopens
the stream, a 401 requests sign-in, and a 404 clears the board cache.
Transient failures and repeated stream rejections retry with jittered
exponential backoff from a one-second base up to 30 seconds.

The stream expires with the session and rotates after 55 minutes.
Membership is rechecked before event delivery and during idle streams.
The external `/api/health` pinger remains necessary on Render Free for an
always-warm demo because outbound heartbeats do not count as inbound traffic.

For a streaming smoke test, use `npm run build` and `npm start`, then open
the endpoint with `curl -N` and a throwaway user's session cookie. Pass the
cookie through local curl configuration and keep it out of terminal
output. Confirm an immediate connection comment, two distinct heartbeat
frames, and a named event after a mutation. Repeat with `--compressed`
locally and after deployment on Render. Only the deployed check can
verify Render ingress delivers frames incrementally.

Board event delivery and stream limits are local to one Node process.
Scaling out requires a shared EventBus implementation such as Redis
pub/sub or PostgreSQL LISTEN/NOTIFY to fan events out to each process.
PostgreSQL would use a dedicated direct listener connection. A global
stream cap would require shared accounting.

## UI

The authenticated shell links to a board list and a read-only live
board. The list supports creating, renaming, and deleting boards.
The board groups cards by column and updates from the SSE stream.

Reusable visual controls live in `src/components`. Feature UI and
query hooks live in `src/features`. The UI uses CSS Modules and
shared variables in `src/styles/tokens.css`. Change
`--color-accent` in that file to update the primary accent.
Verify its contrast against `--color-accent-text` after changing it.
