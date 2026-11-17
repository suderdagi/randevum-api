/**
 * Resets the test database once before the whole test run and applies all migrations.
 */
export default async function setup() {
  process.env.NODE_ENV = 'test';
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL ?? 'postgresql://postgres@localhost:5432/randevum_test';
  process.env.JWT_ACCESS_SECRET ??= 'test-secret-that-is-long-enough';

  const { pool } = await import('../src/db/pool.js');
  const { migrate } = await import('../src/db/migrate.js');

  await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  await migrate(() => {});
  await pool.end();
}
