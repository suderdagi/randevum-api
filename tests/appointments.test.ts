import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { api, createBusinessWithService, pool, registerUser, resetDatabase, slot } from './helpers.js';

beforeEach(resetDatabase);
afterAll(() => pool.end());

async function setup() {
  const data = await createBusinessWithService();
  const customer = await registerUser('customer');
  const book = (startsAt: string, user = customer) =>
    api()
      .post('/api/v1/appointments')
      .set('Authorization', `Bearer ${user.token}`)
      .send({ serviceId: data.service.id, startsAt });
  return { ...data, customer, book };
}

describe('booking', () => {
  it('books a free slot and removes it from availability', async () => {
    const { business, service, book } = await setup();
    const startsAt = slot(1, 10);

    const res = await book(startsAt).expect(201);
    expect(res.body).toMatchObject({ status: 'pending', service: { name: 'Saç kesimi' } });

    const date = startsAt.slice(0, 10);
    const availability = await api()
      .get(`/api/v1/businesses/${business.id}/availability?serviceId=${service.id}&date=${date}`)
      .expect(200);

    const slots: string[] = availability.body.slots;
    expect(slots).not.toContain(slot(1, 10).replace(':00+', ':00.000+'));
    expect(slots).toContain(slot(1, 10, 30).replace(':00+', ':00.000+'));
  });

  it('rejects an overlapping booking with 409 SLOT_TAKEN', async () => {
    const { book } = await setup();
    const other = await registerUser('customer');

    await book(slot(1, 10)).expect(201);
    const res = await book(slot(1, 10, 15), other).expect(409); // 10:15 overlaps 10:00-10:30
    expect(res.body.error.code).toBe('SLOT_TAKEN');
  });

  it('lets exactly one of many simultaneous requests for the same slot succeed', async () => {
    const { book } = await setup();
    const customers = await Promise.all(Array.from({ length: 5 }, () => registerUser('customer')));

    const results = await Promise.all(customers.map((c) => book(slot(2, 14), c)));
    const statuses = results.map((r) => r.status).sort();

    expect(statuses).toEqual([201, 409, 409, 409, 409]);
  });

  it('rejects slots outside working hours, unaligned times and past times', async () => {
    const { book } = await setup();

    await book(slot(1, 8)).expect(400); // before opening
    await book(slot(1, 17, 45)).expect(400); // would end after 18:00
    await book(slot(1, 10, 10)).expect(400); // not on a 15 minute step
    await book(slot(-1, 10)).expect(400); // in the past
  });

  it('does not let owners book appointments', async () => {
    const { owner, book } = await setup();
    await book(slot(1, 11), owner).expect(403);
  });

  it('frees the slot again after cancellation', async () => {
    const { customer, book } = await setup();
    const appointment = await book(slot(3, 12)).expect(201);

    await api()
      .patch(`/api/v1/appointments/${appointment.body.id}/status`)
      .set('Authorization', `Bearer ${customer.token}`)
      .send({ status: 'cancelled' })
      .expect(200);

    const other = await registerUser('customer');
    await book(slot(3, 12), other).expect(201);
  });
});

describe('status changes', () => {
  it('lets the owner confirm but not the customer', async () => {
    const { owner, customer, book } = await setup();
    const { body } = await book(slot(1, 15)).expect(201);
    const patch = (token: string, status: string) =>
      api().patch(`/api/v1/appointments/${body.id}/status`).set('Authorization', `Bearer ${token}`).send({ status });

    expect((await patch(customer.token, 'confirmed')).status).toBe(409);
    expect((await patch(owner.token, 'confirmed')).body.status).toBe('confirmed');
    // Can't complete an appointment that hasn't started yet
    expect((await patch(owner.token, 'completed')).status).toBe(409);
  });

  it('blocks customer cancellation inside the cancellation window', async () => {
    const { customer, book } = await setup();
    // Book the next valid slot today or tomorrow that is less than 2 hours away is hard to
    // guarantee, so insert one directly 1 hour from now
    const { body } = await book(slot(1, 9)).expect(201);
    await pool.query("UPDATE appointments SET starts_at = now() + interval '1 hour', ends_at = now() + interval '90 minutes' WHERE id = $1", [body.id]);

    const res = await api()
      .patch(`/api/v1/appointments/${body.id}/status`)
      .set('Authorization', `Bearer ${customer.token}`)
      .send({ status: 'cancelled' })
      .expect(403);
    expect(res.body.error.message).toContain('2 hours');
  });

  it('hides appointments from unrelated users', async () => {
    const { book } = await setup();
    const { body } = await book(slot(1, 16)).expect(201);
    const stranger = await registerUser('customer');

    await api()
      .patch(`/api/v1/appointments/${body.id}/status`)
      .set('Authorization', `Bearer ${stranger.token}`)
      .send({ status: 'cancelled' })
      .expect(404);
  });

  it('lists appointments for the customer and for the business owner', async () => {
    const { owner, customer, business, book } = await setup();
    await book(slot(1, 10)).expect(201);
    await book(slot(2, 10)).expect(201);

    const mine = await api()
      .get('/api/v1/appointments/me?upcoming=true')
      .set('Authorization', `Bearer ${customer.token}`)
      .expect(200);
    expect(mine.body).toHaveLength(2);
    expect(new Date(mine.body[0].startsAt) < new Date(mine.body[1].startsAt)).toBe(true);

    const date = slot(1, 10).slice(0, 10);
    const forOwner = await api()
      .get(`/api/v1/businesses/${business.id}/appointments?date=${date}`)
      .set('Authorization', `Bearer ${owner.token}`)
      .expect(200);
    expect(forOwner.body).toHaveLength(1);
    expect(forOwner.body[0].customer.fullName).toBe(customer.fullName);
  });
});
