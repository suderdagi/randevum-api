import { z } from 'zod';

const serviceFields = z.object({
  name: z.string().trim().min(2).max(100),
  durationMinutes: z.number().int().min(5).max(480).multipleOf(5),
  price: z.number().min(0).max(1_000_000),
});

export const createServiceSchema = serviceFields;

export const updateServiceSchema = serviceFields
  .extend({ isActive: z.boolean() })
  .partial()
  .refine((data) => Object.keys(data).length > 0, 'Send at least one field to update');
