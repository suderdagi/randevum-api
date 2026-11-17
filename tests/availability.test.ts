import { describe, expect, it } from 'vitest';
import { DateTime } from 'luxon';
import { availableSlots, isWithinWorkingHours } from '../src/modules/appointments/availability.js';

const tz = 'Europe/Istanbul';
const hours = { opensAt: '09:00:00', closesAt: '11:00:00' };
const dayBefore = new Date('2026-11-30T12:00:00Z');

const at = (time: string) => DateTime.fromISO(`2026-12-01T${time}`, { zone: tz });

describe('availableSlots', () => {
  it('returns every 15 minutes where the whole service fits', () => {
    const slots = availableSlots({ date: '2026-12-01', timezone: tz, hours, durationMinutes: 30, busy: [], now: dayBefore });

    expect(slots[0]).toBe('2026-12-01T09:00:00.000+03:00');
    expect(slots.at(-1)).toBe('2026-12-01T10:30:00.000+03:00'); // 10:30 + 30 min = closing time
    expect(slots).toHaveLength(7);
  });

  it('removes slots that overlap an existing booking', () => {
    const busy = [{ start: at('09:30').toJSDate(), end: at('10:00').toJSDate() }];
    const slots = availableSlots({ date: '2026-12-01', timezone: tz, hours, durationMinutes: 30, busy, now: dayBefore });

    expect(slots).not.toContain('2026-12-01T09:15:00.000+03:00'); // would run until 09:45
    expect(slots).not.toContain('2026-12-01T09:30:00.000+03:00');
    expect(slots).not.toContain('2026-12-01T09:45:00.000+03:00');
    expect(slots).toContain('2026-12-01T09:00:00.000+03:00'); // ends exactly when the booking starts
    expect(slots).toContain('2026-12-01T10:00:00.000+03:00'); // starts exactly when it ends
  });

  it('skips times that already passed', () => {
    const now = at('10:05').toJSDate();
    const slots = availableSlots({ date: '2026-12-01', timezone: tz, hours, durationMinutes: 30, busy: [], now });
    expect(slots).toEqual(['2026-12-01T10:15:00.000+03:00', '2026-12-01T10:30:00.000+03:00']);
  });

  it('returns nothing on a closed day', () => {
    expect(availableSlots({ date: '2026-12-01', timezone: tz, hours: null, durationMinutes: 30, busy: [] })).toEqual([]);
  });

  it('handles daylight saving time changes correctly', () => {
    // Berlin switches to summer time on 2026-03-29; local working hours must stay 09:00-11:00
    const slots = availableSlots({
      date: '2026-03-29',
      timezone: 'Europe/Berlin',
      hours,
      durationMinutes: 60,
      busy: [],
      now: new Date('2026-03-01T00:00:00Z'),
    });
    expect(slots[0]).toBe('2026-03-29T09:00:00.000+02:00');
  });
});

describe('isWithinWorkingHours', () => {
  it('accepts a slot aligned to 15 minutes inside working hours', () => {
    expect(isWithinWorkingHours(at('10:15'), 30, hours)).toBe(true);
  });

  it('rejects slots that end after closing, start before opening or are not aligned', () => {
    expect(isWithinWorkingHours(at('10:45'), 30, hours)).toBe(false);
    expect(isWithinWorkingHours(at('08:45'), 30, hours)).toBe(false);
    expect(isWithinWorkingHours(at('09:10'), 30, hours)).toBe(false);
  });
});
