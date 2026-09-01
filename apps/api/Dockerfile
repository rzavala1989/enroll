# syntax=docker/dockerfile:1

# Multi-stage build for the NestJS API.
#
# Migrations are deliberately NOT run here. `prisma migrate deploy`
# belongs in a release or init step that runs exactly once per deploy,
# not in every container's entrypoint, where N replicas starting
# together would race the same migration.

FROM node:26-bookworm-slim AS base
ENV PNPM_HOME=/pnpm
ENV PATH="$PNPM_HOME:$PATH"

# The -slim images omit openssl. Prisma's query and schema engines
# link against it, and without it they fail detection, fall back to an
# openssl-1.1.x build that bookworm does not have, and die with a bare
# "Schema engine error:" carrying no further detail.
RUN apt-get update \
 && apt-get install -y --no-install-recommends openssl ca-certificates \
 && rm -rf /var/lib/apt/lists/*

RUN corepack enable
WORKDIR /repo

# ── Dependencies ────────────────────────────────────────────────────
FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/
COPY packages/shared/package.json packages/shared/
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile

# ── Build ───────────────────────────────────────────────────────────
FROM deps AS build
COPY packages/shared packages/shared
COPY apps/api apps/api
RUN pnpm --filter @enroll/shared build \
 && pnpm --filter api exec prisma generate \
 && pnpm --filter api build

# Drop dev dependencies from the tree we are about to copy forward.
#
# --legacy is required from pnpm 10 on: `deploy` refuses to run against
# a workspace without inject-workspace-packages=true, and this repo
# resolves @enroll/shared through a plain workspace link. Without the
# flag the build dies with ERR_PNPM_DEPLOY_NONINJECTED_WORKSPACE.
RUN pnpm --filter api --prod deploy --legacy /out \
 && cp -r apps/api/prisma /out/prisma

# ── Migrations ──────────────────────────────────────────────────────
# A one-shot image, run to completion before the API starts and never
# as part of it. The runtime stage cannot do this job: `prisma` is a
# devDependency, so `--prod deploy` strips the CLI and only the schema
# survives. This stage still has the full dependency tree.
#
# Compose runs it once via service_completed_successfully rather than
# from an entrypoint, so N replicas cannot race the same migration.
FROM build AS migrate
WORKDIR /repo/apps/api
CMD ["pnpm", "exec", "prisma", "migrate", "deploy"]

# ── Runtime ─────────────────────────────────────────────────────────
FROM node:26-bookworm-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app

# Same reason as the base stage: @prisma/client loads the query engine
# at runtime and needs openssl present in this image too.
RUN apt-get update \
 && apt-get install -y --no-install-recommends openssl ca-certificates \
 && rm -rf /var/lib/apt/lists/*

# Non-root: nothing in this image needs to write outside /tmp.
USER node

COPY --from=build --chown=node:node /out /app

EXPOSE 3000

# Readiness lives at /api/health/ready and reports 503 when Postgres or
# Redis is unreachable. Liveness stays cheap on purpose.
HEALTHCHECK --interval=15s --timeout=3s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health/live').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "dist/main.js"]
