import { describe, expect, it } from 'vitest';

import { sanitizeNext } from './sanitize-next';

describe('sanitizeNext', () => {
  it('keeps a same-origin path with its query string', () => {
    expect(sanitizeNext('/courses/abc?tab=sections')).toBe('/courses/abc?tab=sections');
  });

  it('falls back when there is no next parameter', () => {
    expect(sanitizeNext(undefined)).toBe('/catalog');
    expect(sanitizeNext('')).toBe('/catalog');
  });

  it.each([
    ['an absolute http URL', 'https://evil.example/harvest'],
    ['a protocol-relative URL', '//evil.example/harvest'],
    ['the backslash trick', '/\\evil.example'],
    ['a double backslash', '\\\\evil.example'],
    ['a tab-smuggled host', '/\t/evil.example'],
    ['a newline-smuggled host', '/\n/evil.example'],
    ['a javascript URL', 'javascript:alert(1)'],
    ['a data URL', 'data:text/html,<script>alert(1)</script>'],
  ])('rejects %s', (_label, hostile) => {
    expect(sanitizeNext(hostile)).toBe('/catalog');
  });

  it('drops any fragment rather than passing it through', () => {
    expect(sanitizeNext('/catalog#section')).toBe('/catalog');
  });
});
