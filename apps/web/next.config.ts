import path from 'node:path';
import type { NextConfig } from 'next';

// @enroll/shared is a sibling workspace package, so both the module
// resolver and the standalone output tracer need the monorepo root, not
// apps/web. Inferring it goes wrong in a pnpm workspace.
const WORKSPACE_ROOT = path.join(__dirname, '..', '..');

// Server-side base URL of the NestJS API. The same default lives in
// src/lib/api/server.ts; next.config cannot import from src.
const API_URL = process.env.API_URL ?? 'http://localhost:3000';

/**
 * The API versions its routes (/api/v1/...). Keeping that out of the
 * browser's URLs means the version lives in exactly two places: this
 * rewrite and API_PREFIX in src/lib/api/server.ts, both of which are
 * server-side. Client code keeps calling /api/whatever.
 */
const API_VERSION = 'v1';

const nextConfig: NextConfig = {
  // Traced dependency set for the container image; see apps/web/Dockerfile.
  output: 'standalone',
  outputFileTracingRoot: WORKSPACE_ROOT,
  turbopack: { root: WORKSPACE_ROOT },

  async rewrites() {
    return [
      { source: '/api/:path*', destination: `${API_URL}/api/${API_VERSION}/:path*` },
    ];
  },
};

export default nextConfig;
