import type { Preview } from '@storybook/react';
import React from 'react';
import '../src/app/globals.css';
import { ToastProvider } from '../src/components/toast';

const preview: Preview = {
  parameters: {
    actions: { argTypesRegex: '^on[A-Z].*' },
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },
    nextjs: {
      appDirectory: true,
    },
  },
  decorators: [
    (Story) => (
      <ToastProvider>
        <div style={{ fontFamily: 'var(--font-dm-sans), system-ui, sans-serif' }}>
          <Story />
        </div>
      </ToastProvider>
    ),
  ],
};

export default preview;
