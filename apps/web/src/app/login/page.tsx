import type { Metadata } from 'next';

import { LoginForm } from './login-form';

export const metadata: Metadata = { title: 'Sign in' };

function sanitizeNext(next: string | undefined): string {
  if (!next) return '/catalog';
  // Resolve against a sentinel origin so backslash and control-char tricks
  // (/\evil.com, /<tab>/evil.com) that the URL parser rewrites to an absolute
  // URL get caught by the origin check instead of slipping past startsWith('/').
  const base = 'https://internal.invalid';
  try {
    const url = new URL(next, base);
    if (url.origin !== base) return '/catalog';
    return url.pathname + url.search;
  } catch {
    return '/catalog';
  }
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  return (
    <div className="mx-auto mt-16 max-w-sm">
      <h1 className="font-display text-center text-3xl font-bold text-pine-dark">Enroll</h1>
      <p className="mt-1 text-center text-sm text-ink-soft">UCR course registration</p>
      <LoginForm next={sanitizeNext(next)} />
    </div>
  );
}
