import type { Metadata } from 'next';
import { IBM_Plex_Mono, IBM_Plex_Sans, IBM_Plex_Serif } from 'next/font/google';

import { NavShell } from '@/components/nav-shell';
import { ToastProvider } from '@/components/toast';
import { getIdentity } from '@/lib/identity';

import './globals.css';

const plexSerif = IBM_Plex_Serif({
  variable: '--font-plex-serif',
  subsets: ['latin'],
  weight: ['500', '600', '700'],
});
const plexSans = IBM_Plex_Sans({
  variable: '--font-plex-sans',
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
});
const plexMono = IBM_Plex_Mono({
  variable: '--font-plex-mono',
  subsets: ['latin'],
  weight: ['400', '500', '600'],
});

export const metadata: Metadata = {
  title: { default: 'Enroll', template: '%s | Enroll' },
  description: 'UCR course registration',
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const identity = await getIdentity();

  return (
    <html lang="en">
      <body
        className={`${plexSerif.variable} ${plexSans.variable} ${plexMono.variable} antialiased`}
      >
        <ToastProvider>
          <NavShell identity={identity} />
          <main className="mx-auto max-w-5xl px-4 py-8">{children}</main>
        </ToastProvider>
      </body>
    </html>
  );
}
