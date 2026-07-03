'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { FormEvent } from 'react';
import type { SectionSummary, UpdateSectionRequest } from '@enroll/shared';

import { useToast } from '@/components/toast';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ApiError, apiFetch } from '@/lib/api/client';

const inputClass =
  'mt-1 block w-full rounded-sm border border-line px-2 py-1 text-sm text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pine';

export function SectionSettings({ section }: { section: SectionSummary }) {
  const router = useRouter();
  const toast = useToast();
  const [capacity, setCapacity] = useState(String(section.capacity));
  const [waitlistCap, setWaitlistCap] = useState(
    section.waitlistCap == null ? '' : String(section.waitlistCap),
  );
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(e: FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    try {
      const body: UpdateSectionRequest = {
        capacity: Number(capacity),
        waitlistCap: waitlistCap.trim() === '' ? null : Number(waitlistCap),
      };
      await apiFetch<SectionSummary>(`/sections/${section.id}`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      });
      toast.push({ kind: 'success', title: 'Section updated' });
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Try again.');
    } finally {
      setPending(false);
    }
  }

  return (
    <Card className="max-w-sm">
      <h2 className="font-display text-sm font-semibold text-pine-dark">Section settings</h2>
      <form onSubmit={save} className="mt-3 flex flex-col gap-3">
        <label className="text-xs text-ink-soft" htmlFor="section-capacity">
          Capacity
          <input
            id="section-capacity"
            type="number"
            min={1}
            value={capacity}
            onChange={(e) => setCapacity(e.target.value)}
            className={inputClass}
          />
        </label>
        <label className="text-xs text-ink-soft" htmlFor="section-waitlist-cap">
          Waitlist cap (blank = unlimited, 0 = disabled)
          <input
            id="section-waitlist-cap"
            type="number"
            min={0}
            value={waitlistCap}
            onChange={(e) => setWaitlistCap(e.target.value)}
            className={inputClass}
          />
        </label>
        <Button type="submit" disabled={pending}>
          {pending ? 'Saving' : 'Save'}
        </Button>
        {error && (
          <p role="alert" className="text-xs text-full">
            {error}
          </p>
        )}
      </form>
    </Card>
  );
}
