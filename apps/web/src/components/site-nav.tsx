'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { Role } from '@enroll/shared';
import type { AuthUser } from '@enroll/shared';

import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/cn';

function NavLink({ href, label, active }: { href: string; label: string; active: boolean }) {
  return (
    <Link
      href={href}
      className={cn(
        'rounded-sm px-2 py-1 text-sm font-medium transition-colors',
        active ? 'bg-pine-soft text-pine-dark' : 'text-paper/90 hover:bg-pine-dark',
      )}
    >
      {label}
    </Link>
  );
}

export function SiteNav({ identity }: { identity: AuthUser | null }) {
  const pathname = usePathname();
  const [signingOut, setSigningOut] = useState(false);

  if (pathname === '/login') return null;

  async function signOut() {
    setSigningOut(true);
    await fetch('/api/auth/logout', { method: 'POST' });
    window.location.assign('/login');
  }

  const isStudent = identity?.roles.includes(Role.STUDENT) ?? false;
  const staffRole = identity?.roles.find((r) => r === Role.ADMIN || r === Role.ADVISOR);

  return (
    <header className="border-b-4 border-amber bg-pine">
      <div className="mx-auto flex max-w-5xl items-center gap-6 px-4 py-3">
        <Link href="/catalog" className="font-display text-xl font-bold text-paper">
          Enroll
        </Link>
        <nav className="flex items-center gap-1">
          <NavLink href="/catalog" label="Catalog" active={pathname.startsWith('/catalog')} />
          {isStudent && (
            <NavLink
              href="/enrollments"
              label="My enrollments"
              active={pathname.startsWith('/enrollments')}
            />
          )}
        </nav>
        <div className="ml-auto flex items-center gap-3">
          {identity && (
            <span className="flex items-center gap-2 text-sm text-paper/90">
              {identity.firstName} {identity.lastName}
              {staffRole && <Badge tone="amber">{staffRole}</Badge>}
            </span>
          )}
          <button
            onClick={signOut}
            disabled={signingOut}
            className="rounded-sm border border-paper/30 px-2 py-1 text-xs text-paper/90 hover:bg-pine-dark disabled:opacity-50"
          >
            {signingOut ? 'Signing out' : 'Sign out'}
          </button>
        </div>
      </div>
    </header>
  );
}
