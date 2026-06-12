import type { Metadata } from 'next';
import { Fraunces, Geist, Geist_Mono } from 'next/font/google';

import { SiteNav } from '@/components/site-nav';
import { ToastProvider } from '@/components/toast';
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

  return (
    <html lang="en">
      <body
        className={`${fraunces.variable} ${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <ToastProvider>
          <SiteNav identity={identity} />
          <main className="mx-auto max-w-5xl px-4 py-8">{children}</main>
        </ToastProvider>
      </body>
    </html>
  );
}
