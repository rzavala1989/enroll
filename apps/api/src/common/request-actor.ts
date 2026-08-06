import type { Request } from 'express';

/**
 * Who performed a mutation, as recorded on every audit row.
 *
 * This lived in enrollment.service.ts while sections and waitlist both
 * imported it from there, and each of the three controllers carried its
 * own copy of the extraction logic. One definition, one helper.
 */
export interface RequestActor {
  userId: string;
  ipAddress: string | null;
  userAgent: string | null;
}

/**
 * Address and user agent of the caller.
 *
 * `req.ip` is only the real client address when Express is told how
 * many proxies sit in front of it (TRUST_PROXY_HOPS, applied in
 * main.ts). Behind the Next.js rewrite with that unset, every audit row
 * records the proxy.
 */
export function requestContext(req: Request): Omit<RequestActor, 'userId'> {
  return {
    ipAddress: req.ip ?? null,
    userAgent: req.get('user-agent') ?? null,
  };
}

/** The full actor for an authenticated request. */
export function actorFrom(req: Request, userId: string): RequestActor {
  return { userId, ...requestContext(req) };
}
