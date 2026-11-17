import { z } from 'zod';
import { pagination } from '../../lib/validation.js';

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD format');

export const STATUSES = ['pending', 'confirmed', 'cancelled', 'completed'] as const;
export type AppointmentStatus = (typeof STATUSES)[number];

export const availabilityQuery = z.object({
  serviceId: z.coerce.number().int().positive(),
  date: isoDate,
});

export const createAppointmentSchema = z.object({
  serviceId: z.number().int().positive(),
  // Must include an offset, e.g. 2026-12-01T10:30:00+03:00 or ...Z
  startsAt: z.iso.datetime({ offset: true }),
  note: z.string().trim().max(500).optional(),
});

export const updateStatusSchema = z.object({
  status: z.enum(['confirmed', 'cancelled', 'completed']),
});

export const myAppointmentsQuery = pagination.extend({
  status: z.enum(STATUSES).optional(),
  upcoming: z
    .enum(['true', 'false'])
    .transform((v) => v === 'true')
    .optional(),
});

export const businessAppointmentsQuery = pagination.extend({
  date: isoDate.optional(),
  status: z.enum(STATUSES).optional(),
});
