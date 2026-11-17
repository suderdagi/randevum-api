import bcrypt from 'bcryptjs';
import { pool, withTransaction, type Queryable } from '../../db/pool.js';
import { env } from '../../config/env.js';
import { conflict, notFound, unauthorized } from '../../lib/errors.js';
import { createRefreshToken, hashToken, signAccessToken, type AuthUser } from './tokens.js';

const BCRYPT_ROUNDS = 12;

export interface PublicUser {
  id: number;
  email: string;
  fullName: string;
  phone: string | null;
  role: AuthUser['role'];
  createdAt: Date;
}

const USER_COLUMNS = `id, email, full_name AS "fullName", phone, role, created_at AS "createdAt"`;

async function issueTokens(db: Queryable, user: AuthUser) {
  const refresh = createRefreshToken();
  await db.query(
    `INSERT INTO refresh_tokens (user_id, token_hash, expires_at)
     VALUES ($1, $2, now() + make_interval(days => $3))`,
    [user.id, refresh.hash, env.REFRESH_TOKEN_TTL_DAYS]
  );
  return { accessToken: signAccessToken(user), refreshToken: refresh.token };
}

export async function register(input: {
  email: string;
  password: string;
  fullName: string;
  phone?: string;
  role: AuthUser['role'];
}) {
  const passwordHash = await bcrypt.hash(input.password, BCRYPT_ROUNDS);

  return withTransaction(async (client) => {
    const { rows } = await client.query<PublicUser>(
      `INSERT INTO users (email, password_hash, full_name, phone, role)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (email) DO NOTHING
       RETURNING ${USER_COLUMNS}`,
      [input.email, passwordHash, input.fullName, input.phone ?? null, input.role]
    );

    const user = rows[0];
    if (!user) {
      throw conflict('This email is already registered', 'EMAIL_TAKEN');
    }

    return { user, ...(await issueTokens(client, user)) };
  });
}

export async function login(email: string, password: string) {
  const { rows } = await pool.query<PublicUser & { passwordHash: string }>(
    `SELECT ${USER_COLUMNS}, password_hash AS "passwordHash" FROM users WHERE email = $1`,
    [email]
  );
  const row = rows[0];

  // Same error for unknown email and wrong password, so attackers can't find out which emails exist
  if (!row || !(await bcrypt.compare(password, row.passwordHash))) {
    throw unauthorized('Invalid email or password');
  }

  const { passwordHash: _ignored, ...user } = row;
  return { user, ...(await issueTokens(pool, user)) };
}

/**
 * Refresh token rotation: every refresh token can be used once.
 * If an already used (revoked) token shows up again, it was probably stolen,
 * so every session of that user is revoked.
 */
export async function refresh(refreshToken: string) {
  const result = await withTransaction(async (client) => {
    const { rows } = await client.query<{
      id: number;
      userId: number;
      role: AuthUser['role'];
      revokedAt: Date | null;
      expired: boolean;
    }>(
      `SELECT t.id, t.user_id AS "userId", u.role, t.revoked_at AS "revokedAt",
              t.expires_at < now() AS expired
       FROM refresh_tokens t JOIN users u ON u.id = t.user_id
       WHERE t.token_hash = $1
       FOR UPDATE OF t`,
      [hashToken(refreshToken)]
    );
    const token = rows[0];

    if (!token) return { error: 'Refresh token is invalid' } as const;

    if (token.revokedAt) {
      await client.query(
        'UPDATE refresh_tokens SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL',
        [token.userId]
      );
      // Returning instead of throwing, so this revocation is committed and not rolled back
      return { error: 'Refresh token was already used. Please log in again' } as const;
    }

    if (token.expired) return { error: 'Refresh token has expired' } as const;

    await client.query('UPDATE refresh_tokens SET revoked_at = now() WHERE id = $1', [token.id]);
    return { tokens: await issueTokens(client, { id: token.userId, role: token.role }) } as const;
  });

  if ('error' in result) throw unauthorized(result.error);
  return result.tokens;
}

export async function logout(refreshToken: string) {
  await pool.query(
    'UPDATE refresh_tokens SET revoked_at = now() WHERE token_hash = $1 AND revoked_at IS NULL',
    [hashToken(refreshToken)]
  );
}

export async function getUser(id: number): Promise<PublicUser> {
  const { rows } = await pool.query<PublicUser>(`SELECT ${USER_COLUMNS} FROM users WHERE id = $1`, [id]);
  if (!rows[0]) throw notFound('User');
  return rows[0];
}
