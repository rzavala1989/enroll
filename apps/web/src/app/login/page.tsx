import type { Metadata } from 'next';

import { sanitizeNext } from '@/lib/sanitize-next';

import { LoginForm } from './login-form';

export const metadata: Metadata = { title: 'Sign in' };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  return (
    <div className="mx-auto mt-16 max-w-sm">
      <h1 className="font-display text-center text-3xl font-bold text-pine-dark">
        Enroll
      </h1>
      <p className="mt-1 text-center text-sm text-ink-soft">UCR course registration</p>
      <LoginForm next={sanitizeNext(next)} />
    </div>
  );
}
