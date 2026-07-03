import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Role } from '@enroll/shared';
import type { AuthUser } from '@enroll/shared';

import { SiteNav } from './site-nav';

vi.mock('next/navigation', () => ({
  usePathname: () => '/catalog',
}));

const student: AuthUser = {
  id: 'u1',
  email: 'ada@example.com',
  firstName: 'Ada',
  lastName: 'Lovelace',
  roles: [Role.STUDENT],
};

describe('SiteNav notifications link', () => {
  it('is absent for a signed-out visitor', () => {
    render(<SiteNav identity={null} unreadCount={0} />);
    expect(screen.queryByRole('link', { name: /notifications/i })).not.toBeInTheDocument();
  });

  it('shows a plain Notifications link with no unread', () => {
    render(<SiteNav identity={student} unreadCount={0} />);
    expect(screen.getByRole('link', { name: 'Notifications' })).toBeInTheDocument();
  });

  it('includes the unread count in the accessible name when unread notifications exist', () => {
    render(<SiteNav identity={student} unreadCount={3} />);
    expect(screen.getByRole('link', { name: 'Notifications, 3 unread' })).toBeInTheDocument();
  });
});
