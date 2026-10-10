# syntax=docker/dockerfile:1

# Multi-stage build for the Next.js web app, using the standalone
# output so the runtime image carries a traced dependency set rather
# than the whole node_modules tree.

FROM node:26-bookworm-slim AS base
ENV PNPM_HOME=/pnpm
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable
WORKDIR /repo

# ── Dependencies ────────────────────────────────────────────────────
FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile

# ── Build ───────────────────────────────────────────────────────────
FROM deps AS build
COPY packages/shared packages/shared
COPY apps/web apps/web
ENV NEXT_TELEMETRY_DISABLED=1

# Build-time, not runtime. next.config.ts reads API_URL to construct the
# /api/* rewrite, and `next build` freezes rewrites into
# .next/routes-manifest.json. Setting this only in the runtime
# environment leaves the image pointing at http://localhost:3000, which
# inside a container is the container itself, so every proxied request
# fails with ECONNREFUSED. Under compose this is http://api:3000.
ARG API_URL=http://localhost:3000
ENV API_URL=$API_URL

RUN pnpm --filter @enroll/shared build \
 && pnpm --filter web build

# ── Runtime ─────────────────────────────────────────────────────────
FROM node:26-bookworm-slim AS runtime
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3001
WORKDIR /app

# Also needed at runtime, separately from the build arg above:
# src/lib/api/server.ts reads it per request for server-side fetches,
# and that path is not frozen into the manifest.
ARG API_URL=http://localhost:3000
ENV API_URL=$API_URL

# Bind to all interfaces; the standalone server defaults to localhost,
# which is unreachable from outside the container.
ENV HOSTNAME=0.0.0.0

USER node

COPY --from=build --chown=node:node /repo/apps/web/.next/standalone ./
COPY --from=build --chown=node:node /repo/apps/web/.next/static ./apps/web/.next/static
COPY --from=build --chown=node:node /repo/apps/web/public ./apps/web/public

EXPOSE 3001

HEALTHCHECK --interval=15s --timeout=3s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3001/sign-in').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "apps/web/server.js"]
