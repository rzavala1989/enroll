'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { Role } from '@enroll/shared';
import type { AuthUser } from '@enroll/shared';

import { CrestMark } from '@/components/crest-mark';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/cn';

function BellIcon() {
  return (
    <svg viewBox="0 0 20 20" width="18" height="18" fill="none" aria-hidden="true">
      <path
        d="M10 2.5c-2.2 0-4 1.8-4 4v2.3c0 .5-.2 1-.5 1.4L4.3 12a1 1 0 0 0 .8 1.6h9.8a1 1 0 0 0 .8-1.6l-1.2-1.8c-.3-.4-.5-.9-.5-1.4V6.5c0-2.2-1.8-4-4-4Z"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
      <path
        d="M8.2 15.5a1.8 1.8 0 0 0 3.6 0"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </svg>
  );
}

function NavLink({
  href,
  label,
  active,
}: {
  href: string;
  label: string;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      className={cn(
        'rounded-sm px-2.5 py-1.5 text-sm font-medium transition-colors',
        active
          ? 'bg-pine text-paper'
          : 'text-paper/70 hover:bg-white/10 hover:text-paper',
      )}
    >
      {label}
    </Link>
  );
}

export function SiteNav({
  identity,
  unreadCount,
}: {
  identity: AuthUser | null;
  unreadCount: number;
}) {
  const pathname = usePathname();
  const [signingOut, setSigningOut] = useState(false);

  if (pathname === '/login') return null;

  async function signOut() {
    setSigningOut(true);
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } finally {
      // Navigate to /login regardless: a failed request shouldn't strand the button.
      window.location.assign('/login');
    }
  }

  const isStudent = identity?.roles.includes(Role.STUDENT) ?? false;
  const staffRole = identity?.roles.find((r) => r === Role.ADMIN || r === Role.ADVISOR);

  return (
    <header className="border-b-2 border-pine bg-ink">
      <div className="mx-auto flex max-w-5xl items-center gap-6 px-4 py-2.5">
        <Link href="/catalog" className="flex items-center gap-2.5">
          <CrestMark className="h-7 w-7" />
          <span className="font-display text-lg font-semibold text-paper">Enroll</span>
        </Link>
        <nav className="flex items-center gap-1">
          <NavLink
            href="/catalog"
            label="Catalog"
            active={pathname.startsWith('/catalog')}
          />
          {isStudent && (
            <NavLink
              href="/enrollments"
              label="My enrollments"
              active={pathname.startsWith('/enrollments')}
            />
          )}
        </nav>
        {/* The proxy should make a null identity unreachable outside
            /login, which returns early above. Rendering the identity
            cluster for nobody is the kind of thing that only shows up
            once the guard has a hole, so guard here too. */}
        {identity && (
          <div className="ml-auto flex items-center gap-4">
            <Link
              href="/notifications"
              aria-label={
                unreadCount > 0 ? `Notifications, ${unreadCount} unread` : 'Notifications'
              }
              className={cn(
                'relative rounded-sm p-1.5 transition-colors',
                pathname.startsWith('/notifications')
                  ? 'bg-pine text-paper'
                  : 'text-paper/70 hover:bg-white/10 hover:text-paper',
              )}
            >
              <BellIcon />
              {unreadCount > 0 && (
                <span
                  aria-hidden="true"
                  className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-sm bg-amber px-1 font-mono text-[10px] font-semibold tabular-nums text-paper"
                >
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </Link>
            <div className="flex items-center gap-3 border-l border-white/15 pl-4">
              <span className="flex items-center gap-2 text-sm text-paper/90">
                {identity.firstName} {identity.lastName}
                {staffRole && <Badge tone="amber">{staffRole}</Badge>}
              </span>
              <button
                onClick={signOut}
                disabled={signingOut}
                className="rounded-sm border border-white/25 px-2 py-1 text-xs text-paper/80 transition-colors hover:border-white/50 hover:text-paper disabled:opacity-50"
              >
                {signingOut ? 'Signing out' : 'Sign out'}
              </button>
            </div>
          </div>
        )}
      </div>
    </header>
  );
}
