import type { Metadata } from 'next';

import { CrestMark } from '@/components/crest-mark';
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
    <div className="mt-8 grid overflow-hidden rounded-sm border border-line md:grid-cols-2">
      <div className="relative flex flex-col justify-between overflow-hidden bg-ink px-8 py-10 md:min-h-[30rem] md:px-10 md:py-14">
        <CrestMark className="pointer-events-none absolute -bottom-10 -right-10 h-56 w-56 opacity-[0.07]" />
        <div className="relative flex items-center gap-3">
          <CrestMark className="h-9 w-9 shrink-0" />
          <span className="font-display text-2xl font-semibold text-paper">Enroll</span>
        </div>
        <div className="relative mt-10 md:mt-0">
          <p className="max-w-sm text-lg leading-relaxed text-paper/90">
            Search the catalog, enroll in an open section, and if it&apos;s full you join
            its waitlist. You&apos;re promoted automatically the moment a seat opens.
          </p>
          <p className="mt-6 text-xs uppercase tracking-wide text-paper/50">
            UCR course registration
          </p>
        </div>
      </div>
      <div className="flex flex-col justify-center bg-card px-8 py-10 md:px-10 md:py-14">
        <h1 className="font-display text-2xl font-semibold text-ink">Sign in</h1>
        <p className="mt-1 text-sm text-ink-soft">Use your UCR email and password.</p>
        <div className="mt-6">
          <LoginForm next={sanitizeNext(next)} />
        </div>
      </div>
    </div>
  );
}
