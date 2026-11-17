import { z } from 'zod';
import { badRequest } from './errors.js';

/** Parses untrusted input with a Zod schema and turns failures into a 400 response. */
export function parse<T extends z.ZodType>(schema: T, data: unknown): z.infer<T> {
  const result = schema.safeParse(data);
  if (!result.success) {
    const details = result.error.issues.map((issue) => ({
      field: issue.path.join('.'),
      message: issue.message,
    }));
    throw badRequest('Validation failed', details);
  }
  return result.data;
}

export const idParam = z.object({ id: z.coerce.number().int().positive() });

export const pagination = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const toOffset = ({ page, limit }: { page: number; limit: number }) => (page - 1) * limit;
