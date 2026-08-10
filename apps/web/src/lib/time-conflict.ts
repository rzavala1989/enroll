const DAY_CODES: Record<string, number> = {
  M: 1,
  T: 2,
  W: 3,
  R: 4,
  F: 5,
  S: 6,
  U: 7,
};

interface TimeSlot {
  day: number;
  startMin: number;
  endMin: number;
}

function parseTime(raw: string): number {
  const [h, m] = raw.split(':').map(Number);
  return h * 60 + m;
}

export function parseMeetingPattern(pattern: string): TimeSlot[] {
  if (!pattern) return [];
  const parts = pattern.trim().split(/\s+/);
  if (parts.length !== 2) return [];

  const [dayStr, timeRange] = parts;
  const [startRaw, endRaw] = timeRange.split('-');
  if (!startRaw || !endRaw) return [];

  const startMin = parseTime(startRaw);
  const endMin = parseTime(endRaw);
  if (isNaN(startMin) || isNaN(endMin)) return [];

  const slots: TimeSlot[] = [];
  for (const ch of dayStr) {
    const day = DAY_CODES[ch];
    if (day !== undefined) {
      slots.push({ day, startMin, endMin });
    }
  }
  return slots;
}

function slotsOverlap(a: TimeSlot, b: TimeSlot): boolean {
  return a.day === b.day && a.startMin < b.endMin && b.startMin < a.endMin;
}

export function hasTimeConflict(patternA: string, patternB: string): boolean {
  const slotsA = parseMeetingPattern(patternA);
  const slotsB = parseMeetingPattern(patternB);

  for (const a of slotsA) {
    for (const b of slotsB) {
      if (slotsOverlap(a, b)) return true;
    }
  }
  return false;
}
