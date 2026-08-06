import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { EmptyState } from './empty-state';

describe('EmptyState', () => {
  it('renders the situation as a heading, not body text', () => {
    render(<EmptyState title="No active enrollments" body="Enroll from the catalog." />);

    expect(
      screen.getByRole('heading', { name: 'No active enrollments' }),
    ).toBeInTheDocument();
  });

  it('omits the fact list and the action row when there is nothing to put in them', () => {
    const { container } = render(
      <EmptyState title="Nothing to report" body="Explanation." />,
    );

    expect(container.querySelector('dl')).toBeNull();
  });

  it('renders facts as a definition list so the context is machine-readable', () => {
    render(
      <EmptyState
        title="No students waiting"
        body="Explanation."
        facts={[
          { label: 'Seats', value: '30 of 30 taken' },
          { label: 'Waitlist cap', value: 'Unlimited' },
        ]}
      />,
    );

    expect(screen.getByText('Seats').tagName).toBe('DT');
    expect(screen.getByText('30 of 30 taken').tagName).toBe('DD');
    expect(screen.getByText('Unlimited')).toBeInTheDocument();
  });

  it('renders the action so the empty state is an on-ramp', () => {
    render(
      <EmptyState
        title="No courses match these filters"
        body="Explanation."
        action={<a href="/catalog">Clear all filters</a>}
      />,
    );

    expect(screen.getByRole('link', { name: 'Clear all filters' })).toHaveAttribute(
      'href',
      '/catalog',
    );
  });
});
