'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { Role } from '@enroll/shared';
import type { AuthUser, StudentProfile } from '@enroll/shared';

import { CrestMark } from '@/components/crest-mark';
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

function NavTab({
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
        'relative px-4 py-2.5 text-sm font-medium transition-colors',
        active ? 'text-pine-dark' : 'text-ink-soft hover:text-ink',
      )}
    >
      {label}
      {active && (
        <span
          className="absolute bottom-0 left-4 right-4 h-0.5 bg-pine"
          aria-hidden="true"
        />
      )}
    </Link>
  );
}

function UserInitial({ name }: { name: string }) {
  return (
    <span
      className="flex h-8 w-8 items-center justify-center rounded-full bg-pine text-xs font-semibold text-paper"
      aria-hidden="true"
    >
      {name.charAt(0).toUpperCase()}
    </span>
  );
}

export function SiteNav({
  identity,
  unreadCount,
  profile,
}: {
  identity: AuthUser | null;
  unreadCount: number;
  profile: StudentProfile | null;
}) {
  const pathname = usePathname();
  const [signingOut, setSigningOut] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  if (pathname === '/login') return null;

  async function signOut() {
    setSigningOut(true);
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } finally {
      window.location.assign('/login');
    }
  }

  const isStudent = identity?.roles.includes(Role.STUDENT) ?? false;
  const staffRole = identity?.roles.find((r) => r === Role.ADMIN || r === Role.ADVISOR);

  return (
    <header className="border-b border-line bg-card">
      {/* Top bar: branding and user */}
      <div className="bg-ink">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-2">
          <div className="flex items-center gap-6">
            <Link
              href="/catalog"
              className="flex items-center gap-3 rounded transition-colors hover:opacity-80"
            >
              <CrestMark className="h-8 w-8" />
              <div className="flex flex-col">
                <div className="flex items-center gap-2">
                  <span className="font-display text-lg font-bold leading-tight text-paper tracking-wide">
                    Enroll
                  </span>
                  {profile?.currentTerm && (
                    <>
                      <span className="text-paper/40">&middot;</span>
                      <span className="font-display text-lg font-bold leading-tight text-paper tracking-wide opacity-90">
                        {profile.currentTerm.name}
                      </span>
                    </>
                  )}
                </div>
                {profile?.currentTerm && isStudent && (
                  <div className="mt-0.5 flex items-center gap-2 text-[11px] font-medium text-paper/70 tracking-wide uppercase">
                    <span className="text-pine-soft">Registration open</span>
                    <span>&middot;</span>
                    <span>
                      {profile.currentTerm.enrolledCredits} /{' '}
                      {profile.currentTerm.overloadMaxCredits ??
                        profile.currentTerm.maxCredits}{' '}
                      credits
                    </span>
                    <span>&middot;</span>
                    {profile.holds.length === 0 ? (
                      <span>No holds</span>
                    ) : (
                      <span className="text-amber-soft">
                        {profile.holds.length} hold(s)
                      </span>
                    )}
                  </div>
                )}
              </div>
            </Link>
          </div>

          <div className="flex items-center gap-3">
            {!identity && (
              <Link
                href="/login"
                className="rounded-sm bg-pine px-4 py-1.5 text-sm font-medium text-paper transition-colors hover:bg-pine-dark"
              >
                Sign in
              </Link>
            )}
            {identity && (
              <>
                <Link
                  href="/notifications"
                  aria-label={
                    unreadCount > 0
                      ? `Notifications, ${unreadCount} unread`
                      : 'Notifications'
                  }
                  className={cn(
                    'relative rounded-sm p-1.5 transition-colors',
                    pathname.startsWith('/notifications')
                      ? 'bg-white/15 text-paper'
                      : 'text-paper/60 hover:text-paper',
                  )}
                >
                  <BellIcon />
                  {unreadCount > 0 && (
                    <span
                      aria-hidden="true"
                      className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-full px-1 font-mono text-[10px] font-semibold tabular-nums text-paper"
                    >
                      {unreadCount > 9 ? '9+' : unreadCount}
                    </span>
                  )}
                </Link>

                <div className="relative">
                  <button
                    onClick={() => setMenuOpen(!menuOpen)}
                    className="flex items-center gap-3 rounded-sm p-1.5 transition-colors hover:bg-white/10"
                    aria-expanded={menuOpen}
                    aria-haspopup="true"
                  >
                    <div className="hidden text-right sm:block">
                      <div className="text-sm font-medium text-paper">
                        {identity.firstName} {identity.lastName}
                      </div>
                      {staffRole && (
                        <div className="text-[10px] uppercase tracking-wide text-amber-soft">
                          {staffRole}
                        </div>
                      )}
                    </div>
                    <UserInitial name={identity.firstName} />
                  </button>

                  {menuOpen && (
                    <>
                      <div
                        className="fixed inset-0 z-40"
                        onClick={() => setMenuOpen(false)}
                        aria-hidden="true"
                      />
                      <div className="absolute right-0 top-full z-50 mt-1.5 w-56 rounded-sm border border-line bg-card py-1 shadow-lg">
                        <div className="border-b border-line px-4 py-3">
                          <p className="text-sm font-medium text-ink">
                            {identity.firstName} {identity.lastName}
                          </p>
                          <p className="mt-0.5 text-xs text-ink-soft">{identity.email}</p>
                          {staffRole && (
                            <span className="mt-1.5 inline-block rounded-sm bg-amber-soft px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber">
                              {staffRole}
                            </span>
                          )}
                        </div>
                        <div className="py-1">
                          <Link
                            href="/profile"
                            onClick={() => setMenuOpen(false)}
                            className="block px-4 py-2 text-sm text-ink hover:bg-paper"
                          >
                            Profile
                          </Link>
                          <Link
                            href="/notifications"
                            onClick={() => setMenuOpen(false)}
                            className="block px-4 py-2 text-sm text-ink hover:bg-paper"
                          >
                            Notifications
                            {unreadCount > 0 && (
                              <span className="ml-2 font-mono text-xs text-full">
                                {unreadCount}
                              </span>
                            )}
                          </Link>
                        </div>
                        <div className="border-t border-line py-1">
                          <button
                            onClick={signOut}
                            disabled={signingOut}
                            className="block w-full px-4 py-2 text-left text-sm text-ink hover:bg-paper disabled:opacity-50"
                          >
                            {signingOut ? 'Signing out...' : 'Sign out'}
                          </button>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Navigation tabs */}
      <div className="mx-auto max-w-5xl px-4">
        <nav className="flex items-center" aria-label="Main navigation">
          <NavTab
            href="/catalog"
            label="Catalog"
            active={pathname.startsWith('/catalog') || pathname.startsWith('/courses')}
          />
          {isStudent && (
            <>
              <NavTab
                href="/enrollments"
                label="My Schedule"
                active={pathname.startsWith('/enrollments')}
              />
              <NavTab
                href="/profile"
                label="Academic Profile"
                active={pathname.startsWith('/profile')}
              />
            </>
          )}
          {staffRole && (
            <>
              <NavTab
                href="/enrollments"
                label="Enrollment History"
                active={pathname.startsWith('/enrollments')}
              />
            </>
          )}
        </nav>
      </div>
    </header>
  );
}
