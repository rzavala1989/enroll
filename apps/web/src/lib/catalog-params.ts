import { Department } from '@enroll/shared';
import type { CourseSortBy } from '@enroll/shared';

export interface CatalogParams {
  search: string;
  department: Department | '';
  page: number;
  limit: number;
  sortBy: CourseSortBy;
}

export const PAGE_SIZES = [10, 20, 50, 100] as const;

type RawSearchParams = Record<string, string | string[] | undefined>;

const first = (v: string | string[] | undefined): string | undefined =>
  Array.isArray(v) ? v[0] : v;

export function parseCatalogParams(sp: RawSearchParams): CatalogParams {
  const search = (first(sp.search) ?? '').slice(0, 200);

  const rawDept = first(sp.department) ?? '';
  const department = (Object.values(Department) as string[]).includes(rawDept)
    ? (rawDept as Department)
    : '';

  const page = Math.max(1, parseInt(first(sp.page) ?? '', 10) || 1);

  const rawLimit = parseInt(first(sp.limit) ?? '', 10);
  const limit = (PAGE_SIZES as readonly number[]).includes(rawLimit) ? rawLimit : 20;

  const rawSort = first(sp.sortBy);
  const sortBy: CourseSortBy =
    rawSort === 'code' || rawSort === 'title' || rawSort === 'relevance'
      ? rawSort
      : search
        ? 'relevance'
        : 'code';

  return { search, department, page, limit, sortBy };
}

export function serializeCatalogParams(p: CatalogParams): string {
  const qs = new URLSearchParams();
  if (p.search) qs.set('search', p.search);
  if (p.department) qs.set('department', p.department);
  if (p.page > 1) qs.set('page', String(p.page));
  if (p.limit !== 20) qs.set('limit', String(p.limit));
  // The parse-side default depends on search: 'relevance' when searching,
  // 'code' otherwise. Only omit the value that parse would re-derive.
  const defaultSort = p.search ? 'relevance' : 'code';
  if (p.sortBy !== defaultSort) qs.set('sortBy', p.sortBy);
  return qs.toString();
}
