'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, useTransition } from 'react';
import { ALL_DEPARTMENTS, DEPARTMENT_LABELS } from '@enroll/shared';
import type { Department } from '@enroll/shared';

import type { CatalogParams } from '@/lib/catalog-params';
import { PAGE_SIZES, serializeCatalogParams } from '@/lib/catalog-params';
import { cn } from '@/lib/cn';

const selectCls =
  'rounded-sm border border-line bg-card px-2 py-1.5 text-sm focus:border-pine focus:outline-none';

export function SearchControls({ initial }: { initial: CatalogParams }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [search, setSearch] = useState(initial.search);
  const [syncedSearch, setSyncedSearch] = useState(initial.search);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Re-sync the input when the URL's search changes from outside the box
  // (Clear filters link, browser back/forward). Adjusting state during render
  // is the React-recommended pattern here; the debounce guard below then
  // short-circuits, so this never triggers a redundant navigation.
  if (initial.search !== syncedSearch) {
    setSyncedSearch(initial.search);
    setSearch(initial.search);
  }

  function apply(patch: Partial<CatalogParams>) {
    const next = { ...initial, page: 1, ...patch };
    // Relevance only exists while searching; drop it when search clears so the
    // select value can't dangle to a no-longer-rendered option.
    if (!next.search && next.sortBy === 'relevance') next.sortBy = 'code';
    const qs = serializeCatalogParams(next);
    startTransition(() => router.replace(`/catalog${qs ? `?${qs}` : ''}`, { scroll: false }));
  }

  // Debounced search-as-you-type, 300ms, matching the old Angular UX.
  useEffect(() => {
    if (search === initial.search) return;
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(() => apply({ search }), 300);
    return () => {
      if (debounce.current) clearTimeout(debounce.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  return (
    <div
      className={cn('mt-4 flex flex-wrap items-center gap-2', isPending && 'opacity-60')}
      role="search"
    >
      <input
        type="search"
        aria-label="Search courses"
        placeholder="Search courses"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="w-64 rounded-sm border border-line bg-card px-2 py-1.5 text-sm focus:border-pine focus:outline-none"
      />
      <select
        aria-label="Department"
        value={initial.department}
        onChange={(e) => apply({ department: e.target.value as Department | '' })}
        className={selectCls}
      >
        <option value="">All departments</option>
        {ALL_DEPARTMENTS.map((d) => (
          <option key={d} value={d}>
            {DEPARTMENT_LABELS[d]}
          </option>
        ))}
      </select>
      <select
        aria-label="Sort by"
        value={initial.sortBy}
        onChange={(e) => apply({ sortBy: e.target.value as CatalogParams['sortBy'] })}
        className={selectCls}
      >
        <option value="code">Sort: code</option>
        <option value="title">Sort: title</option>
        {initial.search && <option value="relevance">Sort: relevance</option>}
      </select>
      <select
        aria-label="Page size"
        value={initial.limit}
        onChange={(e) => apply({ limit: Number(e.target.value) })}
        className={selectCls}
      >
        {PAGE_SIZES.map((n) => (
          <option key={n} value={n}>
            {n} per page
          </option>
        ))}
      </select>
    </div>
  );
}
