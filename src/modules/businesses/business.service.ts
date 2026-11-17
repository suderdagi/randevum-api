import { randomBytes } from 'node:crypto';
import type { z } from 'zod';
import { pool, withTransaction, type Queryable } from '../../db/pool.js';
import { forbidden, notFound } from '../../lib/errors.js';
import { slugify } from '../../lib/slug.js';
import { toOffset } from '../../lib/validation.js';
import type {
  createBusinessSchema,
  listBusinessesQuery,
  updateBusinessSchema,
  workingHoursSchema,
} from './business.schemas.js';

type CreateInput = z.infer<typeof createBusinessSchema>;
type UpdateInput = z.infer<typeof updateBusinessSchema>;
type WorkingHoursInput = z.infer<typeof workingHoursSchema>;

const BUSINESS_COLUMNS = `
  b.id, b.owner_id AS "ownerId", b.name, b.slug, b.category, b.city, b.address, b.phone,
  b.description, b.timezone, b.cancellation_hours AS "cancellationHours", b.created_at AS "createdAt"`;

// camelCase API field -> snake_case column, used to build UPDATE statements safely
const UPDATABLE_COLUMNS: Record<keyof UpdateInput, string> = {
  name: 'name',
  category: 'category',
  city: 'city',
  address: 'address',
  phone: 'phone',
  description: 'description',
  timezone: 'timezone',
  cancellationHours: 'cancellation_hours',
};

async function uniqueSlug(db: Queryable, name: string): Promise<string> {
  const base = slugify(name) || 'business';
  const { rowCount } = await db.query('SELECT 1 FROM businesses WHERE slug = $1', [base]);
  return rowCount ? `${base}-${randomBytes(3).toString('hex')}` : base;
}

async function replaceWorkingHours(db: Queryable, businessId: number, hours: WorkingHoursInput) {
  await db.query('DELETE FROM working_hours WHERE business_id = $1', [businessId]);
  for (const day of hours) {
    await db.query(
      'INSERT INTO working_hours (business_id, weekday, opens_at, closes_at) VALUES ($1, $2, $3, $4)',
      [businessId, day.weekday, day.opensAt, day.closesAt]
    );
  }
}

/** Loads a business and makes sure the given user owns it. */
export async function getOwnedBusiness(db: Queryable, businessId: number, ownerId: number) {
  const { rows } = await db.query<{ id: number; ownerId: number; timezone: string }>(
    'SELECT id, owner_id AS "ownerId", timezone FROM businesses WHERE id = $1',
    [businessId]
  );
  const business = rows[0];
  if (!business) throw notFound('Business');
  if (business.ownerId !== ownerId) throw forbidden('You can only manage your own business');
  return business;
}

export async function createBusiness(ownerId: number, input: CreateInput) {
  const { workingHours, ...data } = input;

  const id = await withTransaction(async (client) => {
    const slug = await uniqueSlug(client, data.name);
    const { rows } = await client.query<{ id: number }>(
      `INSERT INTO businesses
         (owner_id, name, slug, category, city, address, phone, description, timezone, cancellation_hours)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING id`,
      [
        ownerId, data.name, slug, data.category, data.city, data.address ?? null,
        data.phone ?? null, data.description ?? null, data.timezone, data.cancellationHours,
      ]
    );
    await replaceWorkingHours(client, rows[0].id, workingHours);
    return rows[0].id;
  });

  return getBusiness(id);
}

export async function updateBusiness(businessId: number, ownerId: number, input: UpdateInput) {
  await getOwnedBusiness(pool, businessId, ownerId);

  const entries = Object.entries(input) as [keyof UpdateInput, unknown][];
  // Column names come from a fixed whitelist, values are always parameters
  const assignments = entries.map(([key], i) => `${UPDATABLE_COLUMNS[key]} = $${i + 2}`);
  await pool.query(`UPDATE businesses SET ${assignments.join(', ')} WHERE id = $1`, [
    businessId,
    ...entries.map(([, value]) => value),
  ]);

  return getBusiness(businessId);
}

export async function setWorkingHours(businessId: number, ownerId: number, hours: WorkingHoursInput) {
  await withTransaction(async (client) => {
    await getOwnedBusiness(client, businessId, ownerId);
    await replaceWorkingHours(client, businessId, hours);
  });
  return getBusiness(businessId);
}

export async function getBusiness(id: number) {
  const { rows } = await pool.query(
    `SELECT ${BUSINESS_COLUMNS},
       COALESCE((
         SELECT json_agg(json_build_object(
                  'weekday', w.weekday,
                  'opensAt', to_char(w.opens_at, 'HH24:MI'),
                  'closesAt', to_char(w.closes_at, 'HH24:MI'))
                ORDER BY w.weekday)
         FROM working_hours w WHERE w.business_id = b.id
       ), '[]') AS "workingHours",
       COALESCE((
         SELECT json_agg(json_build_object(
                  'id', s.id, 'name', s.name,
                  'durationMinutes', s.duration_minutes, 'price', s.price)
                ORDER BY s.name)
         FROM services s WHERE s.business_id = b.id AND s.is_active
       ), '[]') AS services
     FROM businesses b
     WHERE b.id = $1`,
    [id]
  );
  if (!rows[0]) throw notFound('Business');
  return rows[0];
}

export async function listBusinesses(query: z.infer<typeof listBusinessesQuery>) {
  const conditions: string[] = [];
  const values: unknown[] = [];

  if (query.city) {
    values.push(query.city);
    conditions.push(`lower(b.city) = lower($${values.length})`);
  }
  if (query.category) {
    values.push(query.category);
    conditions.push(`b.category = $${values.length}`);
  }
  if (query.q) {
    values.push(`%${query.q}%`);
    conditions.push(`(b.name ILIKE $${values.length} OR b.description ILIKE $${values.length})`);
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  values.push(query.limit, toOffset(query));

  const { rows } = await pool.query(
    `SELECT ${BUSINESS_COLUMNS}, count(*) OVER()::int AS "totalCount"
     FROM businesses b
     ${where}
     ORDER BY b.name
     LIMIT $${values.length - 1} OFFSET $${values.length}`,
    values
  );

  const total = rows[0]?.totalCount ?? 0;
  return {
    data: rows.map(({ totalCount: _t, ...business }) => business),
    pagination: { page: query.page, limit: query.limit, total, totalPages: Math.ceil(total / query.limit) },
  };
}

export async function listOwnBusinesses(ownerId: number) {
  const { rows } = await pool.query(
    `SELECT ${BUSINESS_COLUMNS} FROM businesses b WHERE b.owner_id = $1 ORDER BY b.created_at`,
    [ownerId]
  );
  return rows;
}
