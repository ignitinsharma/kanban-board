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
