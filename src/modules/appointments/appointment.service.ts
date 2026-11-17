import { DateTime } from 'luxon';
import type { z } from 'zod';
import { pool, withTransaction } from '../../db/pool.js';
import { badRequest, conflict, forbidden, notFound } from '../../lib/errors.js';
import { toOffset } from '../../lib/validation.js';
import { getOwnedBusiness } from '../businesses/business.service.js';
import { availableSlots, isWithinWorkingHours, type WorkingDay } from './availability.js';
import { canTransition } from './transitions.js';
import type {
  AppointmentStatus,
  businessAppointmentsQuery,
  createAppointmentSchema,
  myAppointmentsQuery,
} from './appointment.schemas.js';

const MAX_DAYS_AHEAD = 60;

const APPOINTMENT_COLUMNS = `
  a.id, a.business_id AS "businessId", a.service_id AS "serviceId", a.customer_id AS "customerId",
  a.starts_at AS "startsAt", a.ends_at AS "endsAt", a.status, a.note, a.created_at AS "createdAt",
  json_build_object('id', s.id, 'name', s.name, 'durationMinutes', s.duration_minutes, 'price', s.price) AS service`;

interface ServiceWithBusiness {
  serviceId: number;
  businessId: number;
  durationMinutes: number;
  isActive: boolean;
  timezone: string;
}

async function loadService(serviceId: number): Promise<ServiceWithBusiness> {
  const { rows } = await pool.query<ServiceWithBusiness>(
    `SELECT s.id AS "serviceId", s.business_id AS "businessId", s.duration_minutes AS "durationMinutes",
            s.is_active AS "isActive", b.timezone
     FROM services s JOIN businesses b ON b.id = s.business_id
     WHERE s.id = $1`,
    [serviceId]
  );
  if (!rows[0] || !rows[0].isActive) throw notFound('Service');
  return rows[0];
}

async function loadWorkingDay(businessId: number, weekday: number): Promise<WorkingDay | null> {
  const { rows } = await pool.query<WorkingDay>(
    `SELECT opens_at::text AS "opensAt", closes_at::text AS "closesAt"
     FROM working_hours WHERE business_id = $1 AND weekday = $2`,
    [businessId, weekday]
  );
  return rows[0] ?? null;
}

export async function getAvailability(businessId: number, serviceId: number, date: string) {
  const service = await loadService(serviceId);
  if (service.businessId !== businessId) throw notFound('Service');

  const day = DateTime.fromISO(date, { zone: service.timezone });
  if (!day.isValid) throw badRequest('Invalid date');

  const hours = await loadWorkingDay(businessId, day.weekday);
  const { rows: busy } = await pool.query<{ start: Date; end: Date }>(
    `SELECT starts_at AS start, ends_at AS "end" FROM appointments
     WHERE business_id = $1 AND status IN ('pending', 'confirmed')
       AND starts_at < $3 AND ends_at > $2`,
    [businessId, day.startOf('day').toJSDate(), day.endOf('day').toJSDate()]
  );

  return {
    date,
    timezone: service.timezone,
    durationMinutes: service.durationMinutes,
    slots: availableSlots({ date, timezone: service.timezone, hours, durationMinutes: service.durationMinutes, busy }),
  };
}

export async function createAppointment(customerId: number, input: z.infer<typeof createAppointmentSchema>) {
  const service = await loadService(input.serviceId);
  const start = DateTime.fromISO(input.startsAt).setZone(service.timezone);
  const now = DateTime.now();

  if (start <= now) throw badRequest('Appointment time must be in the future');
  if (start > now.plus({ days: MAX_DAYS_AHEAD })) {
    throw badRequest(`Appointments can be booked at most ${MAX_DAYS_AHEAD} days ahead`);
  }

  const hours = await loadWorkingDay(service.businessId, start.weekday);
  if (!isWithinWorkingHours(start, service.durationMinutes, hours)) {
    throw badRequest('Selected time is outside working hours or not a valid slot', { code: 'INVALID_SLOT' });
  }

  const end = start.plus({ minutes: service.durationMinutes });

  // Overlaps are rejected by the appointments_no_overlap constraint (mapped to 409 SLOT_TAKEN)
  const { rows } = await pool.query<{ id: number }>(
    `INSERT INTO appointments (business_id, service_id, customer_id, starts_at, ends_at, note)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
    [service.businessId, service.serviceId, customerId, start.toJSDate(), end.toJSDate(), input.note ?? null]
  );

  return getAppointment(rows[0].id);
}

async function getAppointment(id: number) {
  const { rows } = await pool.query(
    `SELECT ${APPOINTMENT_COLUMNS},
            json_build_object('id', b.id, 'name', b.name, 'address', b.address) AS business
     FROM appointments a
     JOIN services s ON s.id = a.service_id
     JOIN businesses b ON b.id = a.business_id
     WHERE a.id = $1`,
    [id]
  );
  if (!rows[0]) throw notFound('Appointment');
  return rows[0];
}

export async function listMyAppointments(customerId: number, query: z.infer<typeof myAppointmentsQuery>) {
  const conditions = ['a.customer_id = $1'];
  const values: unknown[] = [customerId];

  if (query.status) {
    values.push(query.status);
    conditions.push(`a.status = $${values.length}`);
  }
  if (query.upcoming !== undefined) {
    conditions.push(query.upcoming ? 'a.starts_at >= now()' : 'a.starts_at < now()');
  }

  values.push(query.limit, toOffset(query));
  const { rows } = await pool.query(
    `SELECT ${APPOINTMENT_COLUMNS},
            json_build_object('id', b.id, 'name', b.name, 'address', b.address) AS business
     FROM appointments a
     JOIN services s ON s.id = a.service_id
     JOIN businesses b ON b.id = a.business_id
     WHERE ${conditions.join(' AND ')}
     ORDER BY a.starts_at ${query.upcoming ? 'ASC' : 'DESC'}
     LIMIT $${values.length - 1} OFFSET $${values.length}`,
    values
  );
  return rows;
}

export async function listBusinessAppointments(
  businessId: number,
  ownerId: number,
  query: z.infer<typeof businessAppointmentsQuery>
) {
  const business = await getOwnedBusiness(pool, businessId, ownerId);
  const conditions = ['a.business_id = $1'];
  const values: unknown[] = [businessId];

  if (query.date) {
    const day = DateTime.fromISO(query.date, { zone: business.timezone });
    values.push(day.startOf('day').toJSDate(), day.endOf('day').toJSDate());
    conditions.push(`a.starts_at BETWEEN $${values.length - 1} AND $${values.length}`);
  }
  if (query.status) {
    values.push(query.status);
    conditions.push(`a.status = $${values.length}`);
  }

  values.push(query.limit, toOffset(query));
  const { rows } = await pool.query(
    `SELECT ${APPOINTMENT_COLUMNS},
            json_build_object('id', u.id, 'fullName', u.full_name, 'phone', u.phone) AS customer
     FROM appointments a
     JOIN services s ON s.id = a.service_id
     JOIN users u ON u.id = a.customer_id
     WHERE ${conditions.join(' AND ')}
     ORDER BY a.starts_at
     LIMIT $${values.length - 1} OFFSET $${values.length}`,
    values
  );
  return rows;
}

export async function updateStatus(appointmentId: number, userId: number, to: AppointmentStatus) {
  await withTransaction(async (client) => {
    // Row lock: two status changes on the same appointment can't interleave
    const { rows } = await client.query<{
      status: AppointmentStatus;
      customerId: number;
      ownerId: number;
      startsAt: Date;
      cancellationHours: number;
    }>(
      `SELECT a.status, a.customer_id AS "customerId", b.owner_id AS "ownerId",
              a.starts_at AS "startsAt", b.cancellation_hours AS "cancellationHours"
       FROM appointments a JOIN businesses b ON b.id = a.business_id
       WHERE a.id = $1
       FOR UPDATE OF a`,
      [appointmentId]
    );
    const appointment = rows[0];
    if (!appointment) throw notFound('Appointment');

    const actor =
      appointment.ownerId === userId ? 'owner' : appointment.customerId === userId ? 'customer' : null;
    if (!actor) throw notFound('Appointment'); // don't reveal that it exists

    if (!canTransition(actor, appointment.status, to)) {
      throw conflict(`Cannot change status from ${appointment.status} to ${to}`, 'INVALID_TRANSITION');
    }

    const startsAt = DateTime.fromJSDate(appointment.startsAt);
    if (actor === 'customer' && startsAt.diffNow('hours').hours < appointment.cancellationHours) {
      throw forbidden(`Appointments can be cancelled up to ${appointment.cancellationHours} hours before`);
    }
    if (to === 'completed' && startsAt > DateTime.now()) {
      throw conflict('An appointment cannot be completed before it starts', 'INVALID_TRANSITION');
    }

    await client.query('UPDATE appointments SET status = $2, updated_at = now() WHERE id = $1', [
      appointmentId,
      to,
    ]);
  });

  return getAppointment(appointmentId);
}
