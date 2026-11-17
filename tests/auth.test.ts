import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { api, pool, registerUser, resetDatabase } from './helpers.js';

beforeEach(resetDatabase);
afterAll(() => pool.end());

describe('auth', () => {
  it('registers a user without returning the password hash', async () => {
    const res = await api()
      .post('/api/v1/auth/register')
      .send({ email: 'Sude@Example.com', password: 'password123', fullName: 'Sude Erdağı' })
      .expect(201);

    expect(res.body.user).toMatchObject({ email: 'sude@example.com', role: 'customer' });
    expect(res.body.user.passwordHash).toBeUndefined();
    expect(res.body.accessToken).toEqual(expect.any(String));
  });

  it('rejects duplicate emails and invalid input', async () => {
    const body = { email: 'a@test.com', password: 'password123', fullName: 'Ali Veli' };
    await api().post('/api/v1/auth/register').send(body).expect(201);

    const duplicate = await api().post('/api/v1/auth/register').send(body).expect(409);
    expect(duplicate.body.error.code).toBe('EMAIL_TAKEN');

    const invalid = await api().post('/api/v1/auth/register').send({ email: 'nope', password: '1' }).expect(400);
    expect(invalid.body.error.details.map((d: { field: string }) => d.field)).toEqual(
      expect.arrayContaining(['email', 'password', 'fullName'])
    );
  });

  it('logs in and returns the current user', async () => {
    const user = await registerUser();
    const login = await api()
      .post('/api/v1/auth/login')
      .send({ email: user.email, password: 'password123' })
      .expect(200);

    const me = await api()
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${login.body.accessToken}`)
      .expect(200);
    expect(me.body.id).toBe(user.id);
  });

  it('gives the same error for unknown email and wrong password', async () => {
    const user = await registerUser();
    const wrongPassword = await api().post('/api/v1/auth/login').send({ email: user.email, password: 'wrong-pass' });
    const unknownEmail = await api().post('/api/v1/auth/login').send({ email: 'ghost@test.com', password: 'password123' });

    expect(wrongPassword.status).toBe(401);
    expect(unknownEmail.status).toBe(401);
    expect(wrongPassword.body.error.message).toBe(unknownEmail.body.error.message);
  });

  it('rotates refresh tokens and revokes all sessions when an old one is reused', async () => {
    const user = await registerUser();

    const first = await api().post('/api/v1/auth/refresh').send({ refreshToken: user.refreshToken }).expect(200);
    expect(first.body.refreshToken).not.toBe(user.refreshToken);

    // Reusing the original token looks like theft: it fails and kills the new token too
    await api().post('/api/v1/auth/refresh').send({ refreshToken: user.refreshToken }).expect(401);
    await api().post('/api/v1/auth/refresh').send({ refreshToken: first.body.refreshToken }).expect(401);
  });

  it('cannot refresh after logout', async () => {
    const user = await registerUser();
    await api().post('/api/v1/auth/logout').send({ refreshToken: user.refreshToken }).expect(204);
    await api().post('/api/v1/auth/refresh').send({ refreshToken: user.refreshToken }).expect(401);
  });

  it('rejects requests without a valid access token', async () => {
    await api().get('/api/v1/auth/me').expect(401);
    await api().get('/api/v1/auth/me').set('Authorization', 'Bearer not-a-token').expect(401);
  });
});
