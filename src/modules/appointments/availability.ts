import { DateTime, Interval } from 'luxon';

export interface WorkingDay {
  opensAt: string; // "09:00:00"
  closesAt: string; // "18:30:00"
}

export interface TimeRange {
  start: Date;
  end: Date;
}

export const SLOT_STEP_MINUTES = 15;

/** Working hours of a calendar day in the business's timezone, as a UTC interval. */
export function workingInterval(date: string, timezone: string, hours: WorkingDay): Interval {
  const day = DateTime.fromISO(date, { zone: timezone });
  const at = (time: string) => {
    const [hour, minute] = time.split(':').map(Number);
    return day.set({ hour, minute, second: 0, millisecond: 0 });
  };
  return Interval.fromDateTimes(at(hours.opensAt), at(hours.closesAt));
}

/**
 * Free start times for a service on a given day.
 *
 * Candidate starts are generated every 15 minutes inside working hours. A candidate is kept if
 * the whole appointment fits before closing time, it doesn't overlap an existing booking and it
 * is not in the past. All comparisons happen on absolute instants, so daylight saving time and
 * the server's own timezone don't matter.
 */
export function availableSlots(params: {
  date: string;
  timezone: string;
  hours: WorkingDay | null;
  durationMinutes: number;
  busy: TimeRange[];
  now?: Date;
}): string[] {
  const { date, timezone, hours, durationMinutes, busy } = params;
  if (!hours) return []; // closed that day

  const open = workingInterval(date, timezone, hours);
  const now = DateTime.fromJSDate(params.now ?? new Date());
  const booked = busy.map((b) => Interval.fromDateTimes(b.start, b.end));
  const slots: string[] = [];

  for (let start = open.start!; ; start = start.plus({ minutes: SLOT_STEP_MINUTES })) {
    const end = start.plus({ minutes: durationMinutes });
    if (end > open.end!) break;
    if (start <= now) continue;

    const candidate = Interval.fromDateTimes(start, end);
    if (booked.some((b) => b.overlaps(candidate))) continue;

    slots.push(start.toISO()!);
  }

  return slots;
}

/** Checks that a requested start time is a valid slot start for that day. */
export function isWithinWorkingHours(
  start: DateTime,
  durationMinutes: number,
  hours: WorkingDay | null
): boolean {
  if (!hours) return false;
  const open = workingInterval(start.toISODate()!, start.zoneName!, hours);
  const end = start.plus({ minutes: durationMinutes });
  const minutesFromOpen = start.diff(open.start!, 'minutes').minutes;

  return start >= open.start! && end <= open.end! && minutesFromOpen % SLOT_STEP_MINUTES === 0;
}
