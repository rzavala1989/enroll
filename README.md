# Enroll

Course registration system. pnpm monorepo with a NestJS API and an Angular web app.

## Layout

```
apps/
  api/        NestJS + Prisma + Postgres
  web/        Angular 18 standalone
packages/
  shared/     Shared TypeScript types and enums
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
pnpm dev:web      # http://localhost:4200
```

The Angular dev server proxies `/api/*` to `http://localhost:3000` via `apps/web/proxy.conf.json`.

## Useful scripts

| Script              | What it does                                        |
| ------------------- | --------------------------------------------------- |
| `pnpm dev:api`      | Start the NestJS API in watch mode                  |
| `pnpm dev:web`      | Start the Angular dev server                        |
| `pnpm db:migrate`   | Run `prisma migrate dev` against the API database   |
| `pnpm db:studio`    | Open Prisma Studio                                  |
| `pnpm db:generate`  | Regenerate the Prisma client                        |
| `pnpm build:shared` | Build `@enroll/shared` so apps can pick up changes  |

## Verifying the install

```bash
curl http://localhost:3000/health
# {"ok":true}
```

Then open http://localhost:4200 — you should see the "Enroll, coming soon" home view.
