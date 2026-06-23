# Enroll

Course registration system. pnpm monorepo with a NestJS API and a Next.js web app.

## Layout

```
apps/
  api/          NestJS, Prisma, Postgres
  web/          Next.js 16 (App Router, port 3001)
  web-angular/  Archived Angular 18 app (superseded by apps/web)
packages/
  shared/       Shared TypeScript types and enums
```

## Prerequisites

- Node.js >= 20.11
- pnpm >= 9 (`npm i -g pnpm`)
- A Postgres database (Neon, local, or otherwise)

## First-time setup

From the repo root:

```bash
# 1. Install everything
pnpm install

# 2. Configure the API env
cp apps/api/.env.example apps/api/.env
# then edit apps/api/.env and paste your DATABASE_URL + JWT secrets

# 3. Build the shared package once so apps can resolve it
pnpm build:shared

# 4. Generate the Prisma client and run the first migration
pnpm db:generate
pnpm db:migrate
```

To generate JWT secrets:

```bash
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

Run that twice and paste the values into `JWT_ACCESS_SECRET` and `JWT_REFRESH_SECRET`.

## Running the apps

Two terminals:

```bash
# Terminal 1
pnpm dev:api      # http://localhost:3000

# Terminal 2
pnpm dev:web      # http://localhost:3001 (proxies /api to the NestJS server)
```

The Next.js dev server proxies `/api/*` to `http://localhost:3000` via the `rewrites` in `apps/web/next.config.ts`.

## Useful scripts

| Script              | What it does                                        |
| ------------------- | --------------------------------------------------- |
| `pnpm dev:api`      | Start the NestJS API in watch mode                  |
| `pnpm dev:web`      | Start the Next.js dev server                        |
| `pnpm db:migrate`   | Run `prisma migrate dev` against the API database   |
| `pnpm db:studio`    | Open Prisma Studio                                  |
| `pnpm db:generate`  | Regenerate the Prisma client                        |
| `pnpm build:shared` | Build `@enroll/shared` so apps can pick up changes  |

## NestJS CLI Reference

All commands run from `apps/api/`. Prefix with `npx` if the CLI isn't global.

### Scaffolding

```bash
# Module + controller + service (the standard unit)
nest g module   <name>
nest g controller <name> --no-spec
nest g service  <name> --no-spec

# Guards, pipes, interceptors, filters
nest g guard       <path/name> --no-spec --flat
nest g pipe        <path/name> --no-spec --flat
nest g interceptor <path/name> --no-spec --flat
nest g filter      <path/name> --no-spec --flat

# Decorators, middleware
nest g decorator <path/name> --no-spec --flat
nest g middleware <path/name> --no-spec --flat
```

### Flags

| Flag | What it does |
|------|-------------|
| `--no-spec` | Skip the `.spec.ts` test stub. Write tests deliberately, not from stubs. |
| `--flat` | Place the file directly in the target folder instead of creating a nested subfolder. |
| `--dry-run` | Preview what gets created without writing files. |

### Examples from this project

```bash
# Auth module (Phase 2)
nest g module auth
nest g controller auth --no-spec
nest g service auth --no-spec
nest g guard auth/guards/jwt-auth --no-spec --flat
nest g guard auth/guards/roles --no-spec --flat
nest g decorator auth/decorators/roles --no-spec --flat
nest g decorator auth/decorators/current-user --no-spec --flat
```

### Gotcha

The CLI auto-registers generated controllers and services in the nearest module. If you generate inside a subfolder that doesn't map to a module, check that the import landed in the right place.

## Verifying the install

```bash
curl http://localhost:3000/health
# {"ok":true}
```

Then open http://localhost:3001. The home route redirects to the catalog, sending you to sign-in first if you are logged out.
