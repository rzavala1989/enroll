'use client';

import { useState } from 'react';
import type { FormEvent } from 'react';

import { Button } from '@/components/ui/button';

export function LoginForm({ next }: { next: string }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    try {
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
      setError(
        res.status === 401 ? 'Invalid email or password.' : 'Sign in failed. Try again.',
      );
    } catch {
      setError('Sign in failed. Try again.');
    }
    setPending(false);
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <label className="text-sm font-medium">
        Email
        <input
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="mt-1.5 w-full rounded-sm border border-line bg-card px-2.5 py-2 text-sm focus:border-pine focus:outline-none"
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
          className="mt-1.5 w-full rounded-sm border border-line bg-card px-2.5 py-2 text-sm focus:border-pine focus:outline-none"
        />
      </label>
      {error && (
        <p role="alert" className="text-sm text-full">
          {error}
        </p>
      )}
      <Button type="submit" disabled={pending} className="mt-1">
        {pending ? 'Signing in' : 'Sign in'}
      </Button>
    </form>
  );
}
