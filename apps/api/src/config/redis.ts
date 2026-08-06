/**
 * Redis connection options parsed out of a single REDIS_URL.
 *
 * Shared by the BullMQ root config and the Keyv cache store so the two
 * cannot drift, notably on the `rediss:` TLS branch, which is the
 * difference between working locally and failing against a managed
 * provider.
 */
export interface RedisConnection {
  host: string;
  port: number;
  username?: string;
  password?: string;
  maxRetriesPerRequest: null;
  tls?: Record<string, never>;
}

export function redisConnectionFromUrl(rawUrl: string): RedisConnection {
  const url = new URL(rawUrl);
  return {
    host: url.hostname,
    port: url.port ? Number(url.port) : 6379,
    username: url.username || undefined,
    password: url.password || undefined,
    // BullMQ requires this to be null on the connection its blocking
    // commands use.
    maxRetriesPerRequest: null,
    ...(url.protocol === 'rediss:' ? { tls: {} } : {}),
  };
}
