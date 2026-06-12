import { describe, expect, it } from 'vitest';

import { seatStatus } from './seat-status';

describe('seatStatus', () => {
  it('is full at zero seats', () => {
    expect(seatStatus(0, 30)).toBe('full');
  });

  it('is nearly-full within 10 percent of capacity, minimum 2', () => {
    expect(seatStatus(3, 30)).toBe('nearly-full');
    expect(seatStatus(2, 10)).toBe('nearly-full');
    expect(seatStatus(1, 4)).toBe('nearly-full');
  });

  it('is open otherwise', () => {
    expect(seatStatus(4, 30)).toBe('open');
    expect(seatStatus(25, 30)).toBe('open');
  });
});
