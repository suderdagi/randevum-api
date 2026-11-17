/**
 * Fills an empty database with demo data so the API can be tried right away.
 * Run with: npm run seed
 */
import bcrypt from 'bcryptjs';
import { pool, withTransaction } from './pool.js';

const PASSWORD = 'password123';

async function seed() {
  const hash = await bcrypt.hash(PASSWORD, 10);

  await withTransaction(async (db) => {
    const { rowCount } = await db.query('SELECT 1 FROM users LIMIT 1');
    if (rowCount) {
      console.log('Database is not empty, skipping seed');
      return;
    }

    const owner = await db.query<{ id: number }>(
      `INSERT INTO users (email, password_hash, full_name, phone, role)
       VALUES ('owner@randevum.dev', $1, 'Ayşe Yılmaz', '0532 000 00 00', 'owner') RETURNING id`,
      [hash]
    );
    await db.query(
      `INSERT INTO users (email, password_hash, full_name, role)
       VALUES ('customer@randevum.dev', $1, 'Mehmet Demir', 'customer')`,
      [hash]
    );

    const businesses = [
      { name: 'Kuaför Ayşe', slug: 'kuafor-ayse', category: 'beauty', city: 'Elazığ',
        services: [['Saç kesimi', 30, 350], ['Fön', 20, 200], ['Boya', 90, 1200]] },
      { name: 'Usta Berber', slug: 'usta-berber', category: 'barber', city: 'Elazığ',
        services: [['Saç + sakal', 45, 400], ['Sakal tıraşı', 15, 150]] },
      { name: 'Gülüş Diş Kliniği', slug: 'gulus-dis-klinigi', category: 'dentist', city: 'İstanbul',
        services: [['Muayene', 20, 500], ['Diş taşı temizliği', 40, 1500]] },
    ] as const;

    for (const b of businesses) {
      const { rows } = await db.query<{ id: number }>(
        `INSERT INTO businesses (owner_id, name, slug, category, city, address)
         VALUES ($1, $2, $3, $4, $5, 'Merkez') RETURNING id`,
        [owner.rows[0].id, b.name, b.slug, b.category, b.city]
      );
      const businessId = rows[0].id;

      // Monday to Saturday 09:00-19:00, closed on Sunday
      for (let weekday = 1; weekday <= 6; weekday++) {
        await db.query(
          `INSERT INTO working_hours (business_id, weekday, opens_at, closes_at) VALUES ($1, $2, '09:00', '19:00')`,
          [businessId, weekday]
        );
      }
      for (const [name, duration, price] of b.services) {
        await db.query(
          'INSERT INTO services (business_id, name, duration_minutes, price) VALUES ($1, $2, $3, $4)',
          [businessId, name, duration, price]
        );
      }
    }

    console.log(`Seeded demo data. Log in as owner@randevum.dev or customer@randevum.dev with "${PASSWORD}"`);
  });

  await pool.end();
}

seed().catch(async (error) => {
  console.error(error);
  await pool.end();
  process.exit(1);
});
