'use client';

import { useState } from 'react';
import type { FormEvent } from 'react';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

export function LoginForm({ next }: { next: string }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    if (res.ok) {
      // Full navigation so every RSC renders with the new cookies.
      window.location.assign(next);
      return;
    }
    setPending(false);
    setError(res.status === 401 ? 'Invalid email or password.' : 'Sign in failed. Try again.');
  }

  return (
    <Card className="mt-6">
      <form onSubmit={submit} className="flex flex-col gap-3">
        <label className="text-sm font-medium">
          Email
          <input
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mt-1 w-full rounded-sm border border-line bg-paper px-2 py-1.5 text-sm focus:border-pine focus:outline-none"
          />
        </label>
        <label className="text-sm font-medium">
          Password
          <input
            type="password"
            required
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mt-1 w-full rounded-sm border border-line bg-paper px-2 py-1.5 text-sm focus:border-pine focus:outline-none"
          />
        </label>
        {error && <p className="text-sm text-full">{error}</p>}
        <Button type="submit" disabled={pending}>
          {pending ? 'Signing in' : 'Sign in'}
        </Button>
      </form>
    </Card>
  );
}
