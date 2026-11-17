import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { authenticate, currentUser } from '../../middleware/auth.js';
import { parse } from '../../lib/validation.js';
import { isTest } from '../../config/env.js';
import { loginSchema, refreshSchema, registerSchema } from './auth.schemas.js';
import * as auth from './auth.service.js';

export const authRouter = Router();

// Slows down password guessing: 20 attempts per 15 minutes per IP
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  skip: () => isTest,
  message: { error: { code: 'TOO_MANY_REQUESTS', message: 'Too many attempts, please try again later' } },
});

authRouter.post('/register', authLimiter, async (req, res) => {
  const input = parse(registerSchema, req.body);
  res.status(201).json(await auth.register(input));
});

authRouter.post('/login', authLimiter, async (req, res) => {
  const { email, password } = parse(loginSchema, req.body);
  res.json(await auth.login(email, password));
});

authRouter.post('/refresh', async (req, res) => {
  const { refreshToken } = parse(refreshSchema, req.body);
  res.json(await auth.refresh(refreshToken));
});

authRouter.post('/logout', async (req, res) => {
  const { refreshToken } = parse(refreshSchema, req.body);
  await auth.logout(refreshToken);
  res.status(204).end();
});

authRouter.get('/me', authenticate, async (req, res) => {
  res.json(await auth.getUser(currentUser(req).id));
});
