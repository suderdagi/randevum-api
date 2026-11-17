import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { api, createBusinessWithService, pool, registerUser, resetDatabase } from './helpers.js';

beforeEach(resetDatabase);
afterAll(() => pool.end());

describe('businesses', () => {
  it('lets owners create a business with working hours and services', async () => {
    const { business } = await createBusinessWithService();
    const res = await api().get(`/api/v1/businesses/${business.id}`).expect(200);

    expect(res.body).toMatchObject({ name: 'Kuaför Ayşe', slug: 'kuafor-ayse', city: 'Elazığ' });
    expect(res.body.workingHours).toHaveLength(7);
    expect(res.body.services[0]).toMatchObject({ name: 'Saç kesimi', durationMinutes: 30, price: 350 });
  });

  it('does not let customers create businesses', async () => {
    const customer = await registerUser('customer');
    await api()
      .post('/api/v1/businesses')
      .set('Authorization', `Bearer ${customer.token}`)
      .send({ name: 'X', category: 'barber', city: 'Elazığ' })
      .expect(403);
  });

  it('does not let an owner edit someone else\'s business', async () => {
    const { business } = await createBusinessWithService();
    const otherOwner = await registerUser('owner');

    await api()
      .patch(`/api/v1/businesses/${business.id}`)
      .set('Authorization', `Bearer ${otherOwner.token}`)
      .send({ name: 'Hacked' })
      .expect(403);
  });

  it('only updates the fields that are sent', async () => {
    const { owner, business } = await createBusinessWithService();
    const res = await api()
      .patch(`/api/v1/businesses/${business.id}`)
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ phone: '0424 000 00 00' })
      .expect(200);

    expect(res.body).toMatchObject({ phone: '0424 000 00 00', cancellationHours: 2, name: 'Kuaför Ayşe' });
  });

  it('filters and paginates the business list', async () => {
    await createBusinessWithService();
    await createBusinessWithService(); // same name → slug gets a random suffix

    const res = await api().get('/api/v1/businesses?city=elazığ&category=beauty&limit=1').expect(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.pagination).toMatchObject({ total: 2, totalPages: 2 });

    const other = await api().get('/api/v1/businesses?city=Ankara').expect(200);
    expect(other.body.data).toHaveLength(0);
  });

  it('hides deactivated services', async () => {
    const { owner, business, service } = await createBusinessWithService();
    await api().delete(`/api/v1/services/${service.id}`).set('Authorization', `Bearer ${owner.token}`).expect(204);

    const res = await api().get(`/api/v1/businesses/${business.id}`).expect(200);
    expect(res.body.services).toHaveLength(0);
  });
});
