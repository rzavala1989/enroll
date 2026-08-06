/** Where a visitor with no usable `next` lands after signing in. */
const DEFAULT_DESTINATION = '/catalog';

/**
 * Reduce a `?next=` parameter to a same-origin path, or fall back.
 *
 * Post-login redirect parameters are the classic open-redirect vector:
 * an attacker sends `/login?next=https://evil.example/harvest` and the
 * victim's own bank-grade login flow delivers them to the phish.
 *
 * A `startsWith('/')` check is not enough. `/\evil.com` and
 * `/<tab>/evil.com` both begin with a slash and both get normalized by
 * the URL parser into an absolute URL pointing somewhere else. Parsing
 * against a sentinel origin and rejecting anything whose origin moved
 * catches those, because the parser is the same one the browser will
 * use.
 *
 * Extracted from login/page.tsx so it can be pinned by tests: this is
 * exactly the kind of subtle guard that a well-meaning simplification
 * quietly regresses.
 */
export function sanitizeNext(next: string | undefined): string {
  if (!next) return DEFAULT_DESTINATION;

  const base = 'https://internal.invalid';
  try {
    const url = new URL(next, base);
    if (url.origin !== base) return DEFAULT_DESTINATION;
    return url.pathname + url.search;
  } catch {
    return DEFAULT_DESTINATION;
  }
}
