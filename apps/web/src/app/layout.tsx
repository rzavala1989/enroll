import type { Metadata } from 'next';
import { Fraunces, Geist, Geist_Mono } from 'next/font/google';
import type { NotificationsResponse } from '@enroll/shared';

import { SiteNav } from '@/components/site-nav';
import { ToastProvider } from '@/components/toast';
import { apiGet } from '@/lib/api/server';
import { getIdentity } from '@/lib/identity';

import './globals.css';

const fraunces = Fraunces({ variable: '--font-fraunces', subsets: ['latin'] });
const geistSans = Geist({ variable: '--font-geist-sans', subsets: ['latin'] });
const geistMono = Geist_Mono({ variable: '--font-geist-mono', subsets: ['latin'] });

export const metadata: Metadata = {
  title: { default: 'Enroll', template: '%s | Enroll' },
  description: 'UCR course registration',
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const identity = await getIdentity();
  const unreadCount = identity
    ? (await apiGet<NotificationsResponse>('/notifications?limit=1')).unreadCount
    : 0;

  return (
    <html lang="en">
      <body
        className={`${fraunces.variable} ${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <ToastProvider>
          <SiteNav identity={identity} unreadCount={unreadCount} />
          <main className="mx-auto max-w-5xl px-4 py-8">{children}</main>
        </ToastProvider>
      </body>
    </html>
  );
}
