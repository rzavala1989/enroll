import type { Metadata } from 'next';
import { Crimson_Pro, DM_Sans, JetBrains_Mono } from 'next/font/google';

import { NavShell } from '@/components/nav-shell';
import { ToastProvider } from '@/components/toast';
import { getIdentity } from '@/lib/identity';

import './globals.css';

const crimsonPro = Crimson_Pro({
  variable: '--font-crimson',
  subsets: ['latin'],
  weight: ['500', '600', '700'],
});
const dmSans = DM_Sans({
  variable: '--font-dm-sans',
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
});
const jetbrainsMono = JetBrains_Mono({
  variable: '--font-jb-mono',
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
        className={`${crimsonPro.variable} ${dmSans.variable} ${jetbrainsMono.variable} antialiased`}
        style={{ fontFamily: 'var(--font-dm-sans), system-ui, sans-serif' }}
      >
        <ToastProvider>
          <NavShell identity={identity} />
          <main className="mx-auto max-w-6xl px-4 py-8">{children}</main>
        </ToastProvider>
      </body>
    </html>
  );
}
