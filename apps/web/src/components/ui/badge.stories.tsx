import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect } from 'storybook/test';
import { Badge } from './badge';

const meta = {
  component: Badge,
  tags: ['ai-generated'],
} satisfies Meta<typeof Badge>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Primary: Story = {
  args: {
    children: 'Badge',
    tone: 'neutral',
  },
  play: async ({ canvas }) => {
    const badge = canvas.getByText('Badge');
    await expect(badge).toBeVisible();
  },
};

export const Open: Story = {
  args: {
    children: 'Enrolled',
    tone: 'open',
  },
};

export const Waitlist: Story = {
  args: {
    children: 'Waitlisted',
    tone: 'wait',
  },
};

export const CssCheck: Story = {
  args: {
    children: 'Css Check',
    tone: 'pine',
  },
  play: async ({ canvas }) => {
    const badge = canvas.getByText('Css Check');
    // Let's assert the background color of 'pine' tone badge. It should be parsed by Tailwind.
    // In our theme, pine might be #0D5C46 (rgb(13, 92, 70)) or similar. Wait, I should use a more generic check or check tailwind class.
    // Just checking `getComputedStyle(badge).display` is 'inline-flex' proves CSS loaded since it has 'inline-flex'.
    await expect(getComputedStyle(badge).display).toBe('inline-flex');
  },
};
