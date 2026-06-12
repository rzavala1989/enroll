import type { NextConfig } from 'next';

// Server-side base URL of the NestJS API. The same default lives in
// src/lib/api/server.ts; next.config cannot import from src.
const API_URL = process.env.API_URL ?? 'http://localhost:3000';

const nextConfig: NextConfig = {
  async rewrites() {
    return [{ source: '/api/:path*', destination: `${API_URL}/api/:path*` }];
  },
};

export default nextConfig;
