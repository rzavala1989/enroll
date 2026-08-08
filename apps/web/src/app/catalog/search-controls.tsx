'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, useTransition } from 'react';
import { ALL_DEPARTMENTS, DEPARTMENT_LABELS } from '@enroll/shared';
import type { Department } from '@enroll/shared';

import type { CatalogParams } from '@/lib/catalog-params';
import { PAGE_SIZES, serializeCatalogParams } from '@/lib/catalog-params';
import { cn } from '@/lib/cn';

function SearchIcon() {
  return (
    <svg
      viewBox="0 0 20 20"
      width="16"
      height="16"
      fill="none"
      aria-hidden="true"
      className="text-ink-soft"
    >
      <circle cx="8.5" cy="8.5" r="5.5" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="M12.5 12.5 17 17"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

const selectCls =
  'h-9 rounded-sm border border-line bg-card px-2.5 text-sm text-ink focus:border-pine focus:outline-none';

export function SearchControls({ initial }: { initial: CatalogParams }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [search, setSearch] = useState(initial.search);
  const [syncedSearch, setSyncedSearch] = useState(initial.search);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  if (initial.search !== syncedSearch) {
    setSyncedSearch(initial.search);
    setSearch(initial.search);
  }

  function apply(patch: Partial<CatalogParams>) {
    const next = { ...initial, page: 1, ...patch };
    if (!next.search && next.sortBy === 'relevance') next.sortBy = 'code';
    const qs = serializeCatalogParams(next);
    startTransition(() =>
      router.replace(`/catalog${qs ? `?${qs}` : ''}`, { scroll: false }),
    );
  }

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
      className={cn(
        'mt-4 rounded-sm border border-line bg-card px-4 py-3',
        isPending && 'opacity-60',
      )}
      role="search"
    >
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1" style={{ minWidth: 200 }}>
          <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2">
            <SearchIcon />
          </span>
          <input
            type="search"
            aria-label="Search courses"
            placeholder="Search by code, title, or keyword"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-9 w-full rounded-sm border border-line bg-paper pl-8 pr-3 text-sm focus:border-pine focus:outline-none"
          />
        </div>
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
    </div>
  );
}
