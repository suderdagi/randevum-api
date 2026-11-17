import { z } from 'zod';

export const registerSchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email('Invalid email address')),
  password: z.string().min(8, 'Password must be at least 8 characters').max(72),
  fullName: z.string().trim().min(2).max(100),
  phone: z.string().trim().max(20).optional(),
  role: z.enum(['customer', 'owner']).default('customer'),
});

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email('Invalid email address')),
  password: z.string().min(1),
});

export const refreshSchema = z.object({
  refreshToken: z.string().min(1),
});
