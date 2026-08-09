import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect } from 'storybook/test';
import { EmptyState } from './empty-state';

const meta = {
  component: EmptyState,
  tags: ['ai-generated'],
} satisfies Meta<typeof EmptyState>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Primary: Story = {
  args: {
    title: 'No items found',
    body: 'There are no items matching your current filters. Try adjusting your search criteria.',
  },
  play: async ({ canvas }) => {
    const heading = canvas.getByRole('heading', { name: /no items found/i });
    await expect(heading).toBeVisible();
  },
};

export const WithAction: Story = {
  args: {
    title: 'No active enrollments',
    body: 'You are not enrolled in any courses.',
    action: <button>Browse catalog</button>,
  },
};

export const WithFacts: Story = {
  args: {
    title: 'Waitlist',
    body: 'You are on the waitlist for 1 course.',
    facts: [{ label: 'Position', value: 1 }],
  },
};
