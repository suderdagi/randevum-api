import request from 'supertest';
import { DateTime } from 'luxon';
import { createApp } from '../src/app.js';
import { pool } from '../src/db/pool.js';

export const app = createApp();
export const api = () => request(app);

export async function resetDatabase() {
  await pool.query(
    'TRUNCATE appointments, services, working_hours, businesses, refresh_tokens, users RESTART IDENTITY CASCADE'
  );
}

let counter = 0;

export async function registerUser(role: 'customer' | 'owner' = 'customer') {
  counter += 1;
  const res = await api()
    .post('/api/v1/auth/register')
    .send({ email: `${role}${counter}@test.com`, password: 'password123', fullName: `Test ${role} ${counter}`, role })
    .expect(201);
  return { ...res.body.user, token: res.body.accessToken as string, refreshToken: res.body.refreshToken as string };
}

const ALL_WEEK = [1, 2, 3, 4, 5, 6, 7].map((weekday) => ({ weekday, opensAt: '09:00', closesAt: '18:00' }));

/** An owner with a business open 09:00-18:00 every day and one 30-minute service. */
export async function createBusinessWithService() {
  const owner = await registerUser('owner');
  const business = await api()
    .post('/api/v1/businesses')
    .set('Authorization', `Bearer ${owner.token}`)
    .send({ name: 'Kuaför Ayşe', category: 'beauty', city: 'Elazığ', workingHours: ALL_WEEK })
    .expect(201);
  const service = await api()
    .post(`/api/v1/businesses/${business.body.id}/services`)
    .set('Authorization', `Bearer ${owner.token}`)
    .send({ name: 'Saç kesimi', durationMinutes: 30, price: 350 })
    .expect(201);

  return { owner, business: business.body, service: service.body };
}

/** A slot start time `daysAhead` days from now at the given local hour (Europe/Istanbul). */
export function slot(daysAhead: number, hour: number, minute = 0) {
  return DateTime.now()
    .setZone('Europe/Istanbul')
    .plus({ days: daysAhead })
    .set({ hour, minute, second: 0, millisecond: 0 })
    .toISO()!;
}

export { pool };
