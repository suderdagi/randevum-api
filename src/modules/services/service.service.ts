import type { z } from 'zod';
import { pool } from '../../db/pool.js';
import { forbidden, notFound } from '../../lib/errors.js';
import { getOwnedBusiness } from '../businesses/business.service.js';
import type { createServiceSchema, updateServiceSchema } from './service.schemas.js';

const SERVICE_COLUMNS = `id, business_id AS "businessId", name, duration_minutes AS "durationMinutes",
  price, is_active AS "isActive"`;

const COLUMN_MAP = {
  name: 'name',
  durationMinutes: 'duration_minutes',
  price: 'price',
  isActive: 'is_active',
} as const;

export async function createService(businessId: number, ownerId: number, input: z.infer<typeof createServiceSchema>) {
  await getOwnedBusiness(pool, businessId, ownerId);
  const { rows } = await pool.query(
    `INSERT INTO services (business_id, name, duration_minutes, price)
     VALUES ($1, $2, $3, $4) RETURNING ${SERVICE_COLUMNS}`,
    [businessId, input.name, input.durationMinutes, input.price]
  );
  return rows[0];
}

async function getOwnedService(serviceId: number, ownerId: number) {
  const { rows } = await pool.query<{ ownerId: number }>(
    `SELECT b.owner_id AS "ownerId" FROM services s JOIN businesses b ON b.id = s.business_id WHERE s.id = $1`,
    [serviceId]
  );
  if (!rows[0]) throw notFound('Service');
  if (rows[0].ownerId !== ownerId) throw forbidden('You can only manage your own services');
}

export async function updateService(serviceId: number, ownerId: number, input: z.infer<typeof updateServiceSchema>) {
  await getOwnedService(serviceId, ownerId);

  const entries = Object.entries(input) as [keyof typeof COLUMN_MAP, unknown][];
  const assignments = entries.map(([key], i) => `${COLUMN_MAP[key]} = $${i + 2}`);
  const { rows } = await pool.query(
    `UPDATE services SET ${assignments.join(', ')} WHERE id = $1 RETURNING ${SERVICE_COLUMNS}`,
    [serviceId, ...entries.map(([, value]) => value)]
  );
  return rows[0];
}

/**
 * Services are deactivated instead of deleted, because past appointments still point to them.
 */
export async function deactivateService(serviceId: number, ownerId: number) {
  await getOwnedService(serviceId, ownerId);
  await pool.query('UPDATE services SET is_active = false WHERE id = $1', [serviceId]);
}
