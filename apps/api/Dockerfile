# syntax=docker/dockerfile:1

# Multi-stage build for the NestJS API.
#
# Migrations are deliberately NOT run here. `prisma migrate deploy`
# belongs in a release or init step that runs exactly once per deploy,
# not in every container's entrypoint, where N replicas starting
# together would race the same migration.

FROM node:22-bookworm-slim AS base
ENV PNPM_HOME=/pnpm
ENV PATH="$PNPM_HOME:$PATH"
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
RUN pnpm --filter api --prod deploy /out \
 && cp -r apps/api/prisma /out/prisma

# ── Runtime ─────────────────────────────────────────────────────────
FROM node:22-bookworm-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app

# Non-root: nothing in this image needs to write outside /tmp.
USER node

COPY --from=build --chown=node:node /out /app

EXPOSE 3000

# Readiness lives at /api/health/ready and reports 503 when Postgres or
# Redis is unreachable. Liveness stays cheap on purpose.
HEALTHCHECK --interval=15s --timeout=3s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health/live').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "dist/main.js"]
