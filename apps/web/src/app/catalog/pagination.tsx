import Link from 'next/link';

import type { CatalogParams } from '@/lib/catalog-params';
import { serializeCatalogParams } from '@/lib/catalog-params';
import { cn } from '@/lib/cn';

function pageHref(params: CatalogParams, to: number): string {
  const qs = serializeCatalogParams({ ...params, page: to });
  return `/catalog${qs ? `?${qs}` : ''}`;
}

function PageButton({
  params,
  to,
  current,
}: {
  params: CatalogParams;
  to: number;
  current: boolean;
}) {
  if (current) {
    return (
      <span
        aria-current="page"
        className="inline-flex h-8 min-w-8 items-center justify-center rounded-sm bg-pine px-2 font-mono text-sm font-semibold tabular-nums text-paper"
      >
        {to}
      </span>
    );
  }
  return (
    <Link
      href={pageHref(params, to)}
      className="inline-flex h-8 min-w-8 items-center justify-center rounded-sm px-2 font-mono text-sm tabular-nums text-ink-soft transition-colors hover:bg-card hover:text-pine"
    >
      {to}
    </Link>
  );
}

function Ellipsis() {
  return (
    <span className="inline-flex h-8 min-w-8 items-center justify-center font-mono text-sm text-ink-soft/50">
      ...
    </span>
  );
}

function ArrowButton({
  params,
  to,
  disabled,
  children,
}: {
  params: CatalogParams;
  to: number;
  disabled: boolean;
  children: React.ReactNode;
}) {
  if (disabled) {
    return (
      <span
        aria-disabled="true"
        className="inline-flex h-8 items-center rounded-sm px-2 text-sm text-ink-soft/40"
      >
        {children}
      </span>
    );
  }
  return (
    <Link
      href={pageHref(params, to)}
      className="inline-flex h-8 items-center rounded-sm px-2 text-sm text-ink-soft transition-colors hover:bg-card hover:text-pine"
    >
      {children}
    </Link>
  );
}

function pageRange(current: number, total: number): (number | 'ellipsis')[] {
  if (total <= 7) {
    return Array.from({ length: total }, (_, i) => i + 1);
  }

  const pages: (number | 'ellipsis')[] = [1];

  if (current > 3) pages.push('ellipsis');

  const start = Math.max(2, current - 1);
  const end = Math.min(total - 1, current + 1);

  for (let i = start; i <= end; i++) {
    pages.push(i);
  }

  if (current < total - 2) pages.push('ellipsis');

  pages.push(total);

  return pages;
}

export function Pagination({
  params,
  total,
  totalPages,
}: {
  params: CatalogParams;
  total: number;
  totalPages: number;
}) {
  if (total === 0 || totalPages <= 1) return null;
  const { page } = params;
  const pages = pageRange(page, totalPages);

  return (
    <nav className="mt-6 flex items-center justify-between" aria-label="Pagination">
      <p className="text-xs tabular-nums text-ink-soft">
        {total} courses, page {page} of {totalPages}
      </p>
      <div className="flex items-center gap-0.5">
        <ArrowButton params={params} to={page - 1} disabled={page <= 1}>
          Prev
        </ArrowButton>
        {pages.map((p, i) =>
          p === 'ellipsis' ? (
            <Ellipsis key={`e${i}`} />
          ) : (
            <PageButton key={p} params={params} to={p} current={p === page} />
          ),
        )}
        <ArrowButton params={params} to={page + 1} disabled={page >= totalPages}>
          Next
        </ArrowButton>
      </div>
    </nav>
  );
}
