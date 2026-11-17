import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { pinoHttp } from 'pino-http';
import swaggerUi from 'swagger-ui-express';
import { readFileSync } from 'node:fs';
import { parse as parseYaml } from 'yaml';
import { env } from './config/env.js';
import { logger } from './lib/logger.js';
import { pool } from './db/pool.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import { authRouter } from './modules/auth/auth.routes.js';
import { businessRouter } from './modules/businesses/business.routes.js';
import { serviceRouter } from './modules/services/service.routes.js';
import { appointmentRouter } from './modules/appointments/appointment.routes.js';

const openApiDocument = parseYaml(readFileSync(new URL('../docs/openapi.yaml', import.meta.url), 'utf8'));

export function createApp() {
  const app = express();

  app.disable('x-powered-by');
  app.use(helmet());
  app.use(cors({ origin: env.CORS_ORIGIN === '*' ? true : env.CORS_ORIGIN.split(',') }));
  app.use(express.json({ limit: '100kb' }));
  app.use(pinoHttp({ logger }));

  app.get('/health', async (_req, res) => {
    await pool.query('SELECT 1');
    res.json({ status: 'ok' });
  });

  app.use('/docs', swaggerUi.serve, swaggerUi.setup(openApiDocument));

  app.use('/api/v1/auth', authRouter);
  app.use('/api/v1/businesses', businessRouter);
  app.use('/api/v1/services', serviceRouter);
  app.use('/api/v1/appointments', appointmentRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
