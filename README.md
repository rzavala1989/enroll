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
- pnpm >= 9 (`corepack enable && corepack prepare pnpm@10.33.2 --activate`)
- OrbStack (`brew install orbstack`) or Docker Desktop, for the three
  infrastructure services and the integration tests

The API needs Postgres, Redis, and Mongo. Redis is not optional: the app validates
its environment at boot and refuses to start without `REDIS_URL`. Mongo is, and its
absence is reported rather than fatal, because audit rows buffer in the Postgres
outbox until it comes back.

The containers bind **5442, 6389, and 27027**, not the default 5432, 6379, and 27017. A Homebrew postgres or redis on the default port is common enough that
binding it would either fail outright or, worse, leave the API talking to some
other machine's database while everything looked fine. Override with
`POSTGRES_PORT`, `REDIS_PORT`, or `MONGO_PORT` if these collide too.

## First-time setup

```bash
./setup.sh        # or: pnpm setup
```

Checks for OrbStack and pnpm (starting the OrbStack engine if it is installed but
idle), installs dependencies, builds `@enroll/shared`, brings up the three
containers and waits for their health checks, writes `apps/api/.env`, applies
migrations, and seeds. It is idempotent, so re-run it whenever the stack drifts.
`--reset` wipes the volumes first; `--no-seed` skips the seed.

Seeded logins are 50 students, 5 advisors, and 2 admins, every one with the
password `password`. Emails are faker-generated, so list them rather than guess:

```bash
pnpm db:studio
```

## Environment profiles

`apps/api/.env` is a copy of a profile, not the source of truth. Two exist:

| Profile      | Postgres  | Redis     | Mongo     |
| ------------ | --------- | --------- | --------- |
| `.env.local` | container | container | container |
| `.env.cloud` | Neon      | Upstash   | Atlas     |

```bash
pnpm env:local    # point the API at the containers
pnpm env:cloud    # point it back at the hosted services
pnpm env:which    # show the active profile, secrets redacted
pnpm health       # round-trip every dependency and report what is down
```

Switching rewrites `.env`. If your `.env` matches neither profile, the switcher
saves it to `.env.bak` before overwriting rather than dropping the edits.

## Running

Two modes. Both want ports 3000 and 3001, so each one hands over from the other
rather than letting you discover the clash as a bare `EADDRINUSE` from Next that
never mentions the container actually holding the port.

`pnpm dev` stops the api and web containers and leaves the infrastructure up, so
the database survives the switch. `pnpm stack:up` refuses to start while a host
dev server holds a port. Either takes `--force` to kill whatever is in the way.

**Always on.** Everything, including the API and the web app, runs as a container
with `restart: unless-stopped`. OrbStack is set to start at login, so after a
reboot the whole stack is simply up with nothing to type.

```bash
pnpm stack:up        # build and start all five containers
pnpm stack:rebuild   # after a code change: rebuild api and web
pnpm stack:logs      # tail api and web
pnpm stack:down      # stop everything
```

**Hot reload.** Infrastructure stays in containers, the two apps run on the host
in watch mode.

```bash
pnpm dev             # stops the api and web containers, then watch mode
pnpm dev --force     # also kill host processes squatting on the ports
pnpm dev:api         # or one at a time, no handover
pnpm dev:web
```

`pnpm dev` runs through Turbo's TUI (`ui: "tui"` in `turbo.json`), arrow keys to
switch panes:

```
api#dev           nest start --watch
web#dev           next dev --turbopack -p 3001
//#dev:postgres   docker compose logs -f postgres
//#dev:redis      docker compose logs -f redis
//#dev:mongo      docker compose logs -f mongo
```

The three infrastructure panes **follow** their containers rather than running
them. Letting Turbo own `docker compose up` would tie the database's lifetime to
the dev session, so quitting the TUI would take Postgres down and undo the
always-on setup. They are root tasks (the `//#` prefix), which is what lets them
exist without inventing a workspace package per service.

Turbo degrades to prefixed line output on its own when there is no terminal, and
`scripts/dev.sh` takes the plain `pnpm --parallel` path when stdin or stdout is
not a TTY, so `pnpm dev | tee` and CI stay readable.

Turbo also makes `@enroll/shared` build before either app starts, via
`dependsOn: ["^build"]`. That removes the standing footgun where a fresh clone
fails with a missing-export error that reads like a code bug.

Migrations run as a one-shot `migrate` container that must exit 0 before the API
starts, rather than from the API's entrypoint where replicas would race each
other. `restart: no` keeps a reboot from replaying it; `pnpm stack:up` reruns it,
which is when new migrations land.

The containerised API runs with `NODE_ENV=production`, so Swagger at `/api/docs`
is off there. Use the host dev server when you want it.

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

| Script                      | What it does                                             |
| --------------------------- | -------------------------------------------------------- |
| `./setup.sh`                | Clone to running stack, idempotent                       |
| `pnpm stack:up` / `:down`   | All five containers, always-on mode                      |
| `pnpm stack:rebuild`        | Rebuild the api and web images after a code change       |
| `pnpm dev`                  | Both apps in watch mode on the host                      |
| `pnpm dev:api`              | NestJS in watch mode                                     |
| `pnpm dev:web`              | Next.js dev server                                       |
| `pnpm health`               | Check every dependency, exit 1 if a required one is down |
| `pnpm infra:up` / `:down`   | Start or stop Postgres, Redis, and Mongo                 |
| `pnpm infra:reset`          | Drop the volumes and start clean                         |
| `pnpm infra:logs` / `:ps`   | Tail container logs, list container status               |
| `pnpm env:local` / `:cloud` | Swap the API between containers and hosted services      |
| `pnpm verify`               | Typecheck, lint, test, and build everything              |
| `pnpm test`                 | Unit and component tests for both apps                   |
| `pnpm test:integration`     | Concurrency invariants against a real Postgres (Docker)  |
| `pnpm db:migrate:safe`      | Generate and apply a migration, scrubbing FTS drift      |
| `pnpm db:studio`            | Prisma Studio                                            |
| `pnpm build:shared`         | Rebuild `@enroll/shared` after changing a contract       |

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
