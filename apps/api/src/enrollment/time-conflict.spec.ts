import { hasTimeConflict, parseMeetingPattern } from './time-conflict';

describe('parseMeetingPattern', () => {
  it('parses MWF pattern into three slots', () => {
    const slots = parseMeetingPattern('MWF 9:00-9:50');
    expect(slots).toHaveLength(3);
    expect(slots.map((s) => s.day)).toEqual([1, 3, 5]);
    expect(slots[0].startMin).toBe(540);
    expect(slots[0].endMin).toBe(590);
  });

  it('parses TR pattern into two slots', () => {
    const slots = parseMeetingPattern('TR 1:30-2:45');
    expect(slots).toHaveLength(2);
    expect(slots.map((s) => s.day)).toEqual([2, 4]);
    expect(slots[0].startMin).toBe(90);
    expect(slots[0].endMin).toBe(165);
  });

  it('returns empty for garbage input', () => {
    expect(parseMeetingPattern('')).toEqual([]);
    expect(parseMeetingPattern('ONLINE')).toEqual([]);
  });
});

describe('hasTimeConflict', () => {
  it('detects overlap on a shared day and time', () => {
    expect(hasTimeConflict('MWF 9:00-9:50', 'MWF 9:00-9:50')).toBe(true);
  });

  it('detects partial overlap', () => {
    expect(hasTimeConflict('MWF 9:00-9:50', 'MW 9:30-10:20')).toBe(true);
  });

  it('returns false when times are adjacent but not overlapping', () => {
    expect(hasTimeConflict('MWF 9:00-9:50', 'MWF 9:50-10:40')).toBe(false);
  });

  it('returns false when days do not overlap', () => {
    expect(hasTimeConflict('MWF 9:00-9:50', 'TR 9:00-10:15')).toBe(false);
  });

  it('returns false for non-overlapping times on the same day', () => {
    expect(hasTimeConflict('MWF 8:00-8:50', 'MWF 10:00-10:50')).toBe(false);
  });
});
