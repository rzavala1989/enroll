import Link from 'next/link';

import type { CatalogParams } from '@/lib/catalog-params';
import { serializeCatalogParams } from '@/lib/catalog-params';
import { cn } from '@/lib/cn';

function PageLink({
  params,
  to,
  label,
  disabled,
}: {
  params: CatalogParams;
  to: number;
  label: string;
  disabled: boolean;
}) {
  const cls = cn(
    'rounded-sm border px-2 py-1 text-sm',
    disabled
      ? 'cursor-default border-line text-ink-soft/50'
      : 'border-pine/40 text-pine hover:bg-pine-soft',
  );
  if (disabled)
    return (
      <span className={cls} aria-disabled="true">
        {label}
      </span>
    );
  const qs = serializeCatalogParams({ ...params, page: to });
  return (
    <Link href={`/catalog${qs ? `?${qs}` : ''}`} className={cls}>
      {label}
    </Link>
  );
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
  if (total === 0) return null;
  const { page } = params;
  return (
    <nav className="mt-6 flex items-center justify-between" aria-label="Pagination">
      <p className="text-xs text-ink-soft">
        Page {page} of {totalPages} ({total} courses)
      </p>
      <div className="flex gap-1">
        <PageLink params={params} to={1} label="First" disabled={page <= 1} />
        <PageLink params={params} to={page - 1} label="Prev" disabled={page <= 1} />
        <PageLink params={params} to={page + 1} label="Next" disabled={page >= totalPages} />
        <PageLink params={params} to={totalPages} label="Last" disabled={page >= totalPages} />
      </div>
    </nav>
  );
}
