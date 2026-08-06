# Enroll

Course registration system. pnpm monorepo with a NestJS API and a Next.js web app.

## Layout

```
apps/
  api/          NestJS, Prisma, Postgres, Redis (BullMQ), Mongo (audit)
  web/          Next.js 16 (App Router, port 3001)
  web-angular/  Archived Angular 18 client, outside the pnpm workspace
packages/
  shared/       TypeScript contracts both apps import as @enroll/shared
load/           k6 registration-day load profile
scripts/        migrate-safe.sh, the Prisma generated-column workaround
```

## Prerequisites

- Node.js >= 20.11
- pnpm >= 9 (`npm i -g pnpm`)
- Docker, for the three infrastructure services and the integration tests

The API needs Postgres, Redis, and Mongo. Redis is not optional: the app validates
its environment at boot and refuses to start without `REDIS_URL`. Mongo is, and its
absence is reported rather than fatal, because audit rows buffer in the Postgres
outbox until it comes back.

## First-time setup

From the repo root:

```bash
# 1. Infrastructure: Postgres, Redis, Mongo
pnpm infra:up

# 2. Install
pnpm install

# 3. Configure the API
cp apps/api/.env.example apps/api/.env
# The defaults match docker-compose. Set JWT_ACCESS_SECRET:
#   openssl rand -hex 32

# 4. Build the shared package so both apps can resolve it
pnpm build:shared

# 5. Prisma client and schema
pnpm db:generate
pnpm --filter api exec prisma migrate deploy

# 6. Seed (refuses to run against a non-local database)
pnpm --filter api prisma db seed
```

## Running

```bash
pnpm dev:api      # http://localhost:3000
pnpm dev:web      # http://localhost:3001
```

The Next.js dev server rewrites `/api/*` to the API's versioned routes
(`/api/v1/*`) via `apps/web/next.config.ts`, so browser code keeps calling `/api`
and the version lives server-side.

## Verifying

```bash
pnpm verify   # typecheck, lint, test, build across both apps
```

Individually:

```bash
curl http://localhost:3000/api/health/ready
# {"status":"ok","checks":{"postgres":"up","redis":"up","mongo":"up"}}

curl http://localhost:3000/api/metrics   # Prometheus exposition
open http://localhost:3000/api/docs      # Swagger, non-production only
```

Then open http://localhost:3001. The home route redirects to the catalog, via
sign-in if you are logged out.

## Scripts

| Script                    | What it does                                            |
| ------------------------- | ------------------------------------------------------- |
| `pnpm dev:api`            | NestJS in watch mode                                    |
| `pnpm dev:web`            | Next.js dev server                                      |
| `pnpm infra:up` / `:down` | Start or stop Postgres, Redis, and Mongo                |
| `pnpm verify`             | Typecheck, lint, test, and build everything             |
| `pnpm test`               | Unit and component tests for both apps                  |
| `pnpm test:integration`   | Concurrency invariants against a real Postgres (Docker) |
| `pnpm db:migrate:safe`    | Generate and apply a migration, scrubbing FTS drift     |
| `pnpm db:studio`          | Prisma Studio                                           |
| `pnpm build:shared`       | Rebuild `@enroll/shared` after changing a contract      |

## Migrations

Use `pnpm db:migrate:safe <name>`, not `prisma migrate dev`.

`Course.searchVector` is a Postgres generated column, which Prisma cannot model, so
every migration that diffs `Course` picks up two spurious lines: a `DROP INDEX` that
silently removes the GIN index catalog search depends on, and a `DROP DEFAULT` that
fails at apply time. The script strips both, and CI fails any migration that
reintroduces them.

## Deployment notes

Two things do not survive a naive scale-out:

- **Schedulers.** The audit outbox drain, the hourly waitlist expiry, and the
  promotion safety-net sweep are timer-driven and not leader-elected. Run web
  replicas with `SCHEDULERS_ENABLED=false` and exactly one worker deployment with it
  on. BullMQ promotion workers run everywhere regardless; only timers are gated.
- **`TRUST_PROXY_HOPS`.** Set it to the number of proxies in front of the process.
  Left at 0, `req.ip` is the proxy's address, so the audit trail attributes every
  action to the load balancer and IP throttling treats all traffic as one client.

Migrations belong in a release step that runs once, not in a container entrypoint
where replicas would race each other.

## Further reading

- `apps/api/prisma/schema.prisma` for the data model, with the locking and
  constraint rationale in comments
- `apps/api/src/enrollment/enrollment.service.ts` for seat allocation under row locks
- `apps/web/src/proxy.ts` for the session gate and single-flight token refresh
- `load/registration-day.js` for what to measure before a real registration day
- `bible/` for the chapter-by-chapter build record (local only, not in git)
