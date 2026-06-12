import { describe, expect, it } from 'vitest';
import { Department } from '@enroll/shared';

import { parseCatalogParams, serializeCatalogParams } from './catalog-params';

describe('parseCatalogParams', () => {
  it('returns defaults for an empty query', () => {
    expect(parseCatalogParams({})).toEqual({
      search: '',
      department: '',
      page: 1,
      limit: 20,
      sortBy: 'code',
    });
  });

  it('parses valid values and takes the first of repeated params', () => {
    expect(
      parseCatalogParams({
        search: ['algo', 'x'],
        department: 'CS',
        page: '3',
        limit: '50',
        sortBy: 'title',
      }),
    ).toEqual({ search: 'algo', department: Department.CS, page: 3, limit: 50, sortBy: 'title' });
  });

  it('defaults sortBy to relevance when searching', () => {
    expect(parseCatalogParams({ search: 'algo' }).sortBy).toBe('relevance');
  });

  it('rejects junk: bad department, page below 1, off-menu limit', () => {
    const p = parseCatalogParams({ department: 'NOPE', page: '-2', limit: '37' });
    expect(p.department).toBe('');
    expect(p.page).toBe(1);
    expect(p.limit).toBe(20);
  });

  it('clamps page zero to 1', () => {
    expect(parseCatalogParams({ page: '0' }).page).toBe(1);
  });
});

describe('serializeCatalogParams', () => {
  it('omits defaults so URLs stay clean', () => {
    expect(
      serializeCatalogParams({ search: '', department: '', page: 1, limit: 20, sortBy: 'code' }),
    ).toBe('');
  });

  it('serializes non-defaults', () => {
    expect(
      serializeCatalogParams({ search: 'algo', department: Department.CS, page: 2, limit: 50, sortBy: 'relevance' }),
    ).toBe('search=algo&department=CS&page=2&limit=50');
  });

  it('keeps an explicit code sort when searching, so the URL round-trips', () => {
    const qs = serializeCatalogParams({
      search: 'algo',
      department: '',
      page: 1,
      limit: 20,
      sortBy: 'code',
    });
    expect(qs).toBe('search=algo&sortBy=code');
    expect(parseCatalogParams(Object.fromEntries(new URLSearchParams(qs))).sortBy).toBe('code');
  });

  it('round-trips a relevance search without writing sortBy', () => {
    const qs = serializeCatalogParams({
      search: 'algo',
      department: '',
      page: 1,
      limit: 20,
      sortBy: 'relevance',
    });
    expect(qs).toBe('search=algo');
    expect(parseCatalogParams(Object.fromEntries(new URLSearchParams(qs))).sortBy).toBe('relevance');
  });
});
