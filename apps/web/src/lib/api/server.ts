import { cookies } from 'next/headers';
import { notFound, redirect } from 'next/navigation';

// Server-to-server base URL (same default duplicated in next.config.ts,
// which cannot import from src/). Read at runtime on the Node server;
// this never bakes into a client bundle.
export const API_URL = process.env.API_URL ?? 'http://localhost:3000';

/**
 * GET from the NestJS API inside a Server Component, forwarding the
 * incoming request's cookies.
 *
 * Careful: redirect() and notFound() throw control-flow errors. Never
 * call apiGet inside a try/catch that would swallow them.
 * 403 maps to /catalog; pages calling role-restricted endpoints rely on
 * this as their access control fallback.
 */
export async function apiGet<T>(path: string): Promise<T> {
  const cookieHeader = (await cookies()).toString();
  const res = await fetch(`${API_URL}/api${path}`, {
    headers: { cookie: cookieHeader },
    cache: 'no-store',
  });

  if (res.status === 401) redirect('/login');
  if (res.status === 403) redirect('/catalog');
  if (res.status === 404) notFound();
  if (!res.ok) throw new Error(`API responded ${res.status} on GET ${path}`);

  return res.json() as Promise<T>;
}
