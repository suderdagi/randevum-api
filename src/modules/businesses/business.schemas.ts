import { z } from 'zod';
import { IANAZone } from 'luxon';
import { pagination } from '../../lib/validation.js';

const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use HH:mm format');

export const workingHoursSchema = z
  .array(
    z
      .object({
        weekday: z.number().int().min(1).max(7),
        opensAt: time,
        closesAt: time,
      })
      .refine((h) => h.opensAt < h.closesAt, { message: 'opensAt must be before closesAt' })
  )
  .max(7)
  .refine((days) => new Set(days.map((d) => d.weekday)).size === days.length, {
    message: 'Each weekday can appear only once',
  });

export const CATEGORIES = ['barber', 'beauty', 'clinic', 'dentist', 'fitness', 'tattoo', 'other'] as const;

const businessFields = z.object({
  name: z.string().trim().min(2).max(100),
  category: z.enum(CATEGORIES),
  city: z.string().trim().min(2).max(50),
  address: z.string().trim().max(200).optional(),
  phone: z.string().trim().max(20).optional(),
  description: z.string().trim().max(1000).optional(),
  timezone: z.string().refine((tz) => IANAZone.isValidZone(tz), 'Unknown timezone'),
  cancellationHours: z.number().int().min(0).max(168),
});

export const createBusinessSchema = businessFields.extend({
  timezone: businessFields.shape.timezone.default('Europe/Istanbul'),
  cancellationHours: businessFields.shape.cancellationHours.default(2),
  workingHours: workingHoursSchema.default([]),
});

// No defaults here: a PATCH must only change the fields that were sent
export const updateBusinessSchema = businessFields
  .partial()
  .refine((data) => Object.keys(data).length > 0, 'Send at least one field to update');

export const listBusinessesQuery = pagination.extend({
  city: z.string().trim().optional(),
  category: z.enum(CATEGORIES).optional(),
  q: z.string().trim().max(100).optional(),
});
