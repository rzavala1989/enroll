import { z } from 'zod';

/**
 * Boot-time environment contract.
 *
 * Every setting the app depends on is declared here and validated
 * before Nest wires a single provider. Without this, a missing
 * JWT_ACCESS_SECRET surfaces at the first login attempt (as a 500, in
 * production, hours after deploy) rather than at boot, and an operator
 * has no single place to read what the service actually needs.
 *
 * Note what is absent: JWT_REFRESH_SECRET. Refresh tokens are opaque
 * 32-byte random strings stored as SHA-256 hashes, never JWTs, so
 * nothing ever read that variable. It stayed in .env.example and the
 * README long enough for operators to be rotating a secret that does
 * nothing.
 */

const durationString = z
  .string()
  .regex(/^\d+(ms|s|m|h|d)$/, 'expected a duration like 15m, 7d, 500ms');

/** Comma-separated list, trimmed, with empty entries dropped. */
function csvWithDefault(fallback: string) {
  return z
    .string()
    .default(fallback)
    .transform((raw) =>
      raw
        .split(',')
        .map((part) => part.trim())
        .filter((part) => part.length > 0),
    );
}

export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),

  DATABASE_URL: z.string().min(1),

  JWT_ACCESS_SECRET: z
    .string()
    .min(32, 'use at least 32 characters; generate with `openssl rand -hex 32`'),
  JWT_ACCESS_EXPIRY: durationString.default('15m'),
  JWT_REFRESH_EXPIRY: durationString.default('7d'),

  REDIS_URL: z.string().min(1),

  MONGODB_URI: z.string().optional(),
  MONGODB_DB: z.string().default('enroll_audit'),

  /**
   * Comma-separated browser origins allowed to send credentialed
   * requests. Empty in production is a boot failure: an API that
   * accepts cookies from anywhere is worse than one nobody can reach.
   */
  CORS_ORIGINS: csvWithDefault('http://localhost:3001'),

  /**
   * Number of reverse proxies in front of this process. Express reads
   * X-Forwarded-For up to this depth to populate `req.ip`, which is
   * what the audit trail records as the actor's address. Left at 0
   * behind the Next.js rewrite, every audit row says "the proxy did
   * it" and any IP-based throttling counts the whole internet as one
   * client.
   */
  TRUST_PROXY_HOPS: z.coerce.number().int().min(0).default(0),

  /**
   * Whether this process runs the in-process schedulers: the audit
   * outbox drain, the hourly waitlist expiry, and the promotion
   * safety-net sweep. They are not leader-elected, so with two API
   * replicas both drain the outbox and both send expiry notifications.
   * Run exactly one deployment with this on.
   */
  SCHEDULERS_ENABLED: z
    .enum(['true', 'false'])
    .default('true')
    .transform((v) => v === 'true'),

  /** TTL for cached catalog pages, which carry live seat counts. */
  CATALOG_CACHE_TTL_MS: z.coerce.number().int().positive().default(15_000),

  LOG_LEVEL: z
    .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
    .default('info'),

  /** Gate on the destructive seed. See prisma/seed.ts. */
  SEED_CONFIRM: z.string().optional(),
});

export type Env = z.infer<typeof envSchema>;

/**
 * ConfigModule `validate` hook. Throwing here aborts the bootstrap, so
 * a misconfigured deploy fails at start instead of at first request.
 */
export function validateEnv(raw: Record<string, unknown>): Env {
  const parsed = envSchema.safeParse(raw);
  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => `  ${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${details}`);
  }

  if (parsed.data.NODE_ENV === 'production' && parsed.data.CORS_ORIGINS.length === 0) {
    throw new Error(
      'Invalid environment configuration:\n  CORS_ORIGINS: required in production',
    );
  }

  return parsed.data;
}
