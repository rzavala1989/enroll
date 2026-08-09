import type { MyEnrollment } from '@enroll/shared';

const DAY_CODES: Record<string, number> = {
  M: 1, // Monday
  T: 2, // Tuesday
  W: 3, // Wednesday
  R: 4, // Thursday
  F: 5, // Friday
};

const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];

interface ParsedSlot {
  day: number; // 1-5
  startMin: number;
  endMin: number;
  courseCode: string;
  title: string;
  room: string;
}

function parseMeetingPattern(
  pattern: string,
  courseCode: string,
  title: string,
  room: string,
): ParsedSlot[] {
  const parts = pattern.trim().split(/\s+/);
  if (parts.length !== 2) return [];

  const [dayStr, timeRange] = parts;
  const [startRaw, endRaw] = timeRange.split('-');
  if (!startRaw || !endRaw) return [];

  const parseTime = (raw: string) => {
    const parts = raw.split(':').map(Number);
    let h = parts[0];
    const m = parts[1];
    // Adjust for PM if university time isn't military (e.g. 1:30-2:45)
    // Assume classes don't start before 8 AM.
    if (h < 8) h += 12;
    return h * 60 + m;
  };

  const startMin = parseTime(startRaw);
  const endMin = parseTime(endRaw);
  if (isNaN(startMin) || isNaN(endMin)) return [];

  const slots: ParsedSlot[] = [];
  for (const ch of dayStr) {
    const day = DAY_CODES[ch];
    if (day !== undefined) {
      slots.push({ day, startMin, endMin, courseCode, title, room });
    }
  }
  return slots;
}

const COLORS = [
  'bg-pine/20 border-pine/30 text-pine-dark',
  'bg-amber/20 border-amber/30 text-amber',
  'bg-full/20 border-full/30 text-full',
  'bg-wait/20 border-wait/30 text-wait',
  'bg-blue-500/20 border-blue-500/30 text-blue-800',
  'bg-purple-500/20 border-purple-500/30 text-purple-800',
];

export function ScheduleGrid({ enrollments }: { enrollments: MyEnrollment[] }) {
  const startHour = 8; // 8 AM
  const endHour = 18; // 6 PM
  const totalHours = endHour - startHour;

  const hourLabels = Array.from({ length: totalHours + 1 }, (_, i) => {
    const h = startHour + i;
    return h > 12 ? `${h - 12} PM` : h === 12 ? '12 PM' : `${h} AM`;
  });

  const slots = enrollments.flatMap((e, i) => {
    const parsed = parseMeetingPattern(
      e.section.meetingPattern,
      e.course.code,
      e.course.title,
      e.section.room,
    );
    return parsed.map((p) => ({ ...p, colorClass: COLORS[i % COLORS.length] }));
  });

  return (
    <div className="rounded-sm border border-line bg-card overflow-x-auto">
      <div className="min-w-[600px]">
        {/* Header Row */}
        <div className="flex border-b border-line bg-line/10">
          <div className="w-16 shrink-0 border-r border-line p-3 text-center text-xs font-medium text-ink-soft" />
          {DAY_NAMES.map((d) => (
            <div
              key={d}
              className="flex-1 border-r border-line p-3 text-center text-xs font-semibold uppercase tracking-wider text-ink"
            >
              {d}
            </div>
          ))}
        </div>

        {/* Grid Body */}
        <div className="relative flex" style={{ height: totalHours * 60 }}>
          {/* Time Labels */}
          <div className="w-16 shrink-0 border-r border-line relative">
            {hourLabels.map((label, i) => (
              <div
                key={label}
                className="absolute w-full text-right pr-2 text-[10px] font-medium text-ink-soft -translate-y-2"
                style={{ top: i * 60 }}
              >
                {label}
              </div>
            ))}
          </div>

          {/* Day Columns */}
          {DAY_NAMES.map((_, dayIndex) => {
            const dayNum = dayIndex + 1; // 1-5
            const daySlots = slots.filter((s) => s.day === dayNum);

            return (
              <div key={dayNum} className="relative flex-1 border-r border-line">
                {/* Hourly grid lines */}
                {Array.from({ length: totalHours }).map((_, i) => (
                  <div
                    key={i}
                    className="absolute w-full border-t border-line/50 border-dashed"
                    style={{ top: i * 60 }}
                  />
                ))}

                {/* Blocks */}
                {daySlots.map((slot, i) => {
                  const top = ((slot.startMin - startHour * 60) / 60) * 60;
                  const height = ((slot.endMin - slot.startMin) / 60) * 60;
                  return (
                    <div
                      key={i}
                      className={`absolute w-[calc(100%-8px)] left-1 rounded-sm border p-2 text-xs shadow-sm transition-all hover:brightness-95 ${slot.colorClass}`}
                      style={{ top, height }}
                    >
                      <div className="font-semibold leading-tight">{slot.courseCode}</div>
                      <div className="truncate text-[10px] opacity-80">{slot.room}</div>
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
