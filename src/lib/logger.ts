import pino from 'pino';
import { env } from '../config/env.js';

// pino-http logs every request header by default, which would put users' access tokens in the logs
export const LOG_REDACT_PATHS = ['req.headers.authorization', 'req.headers.cookie', 'res.headers["set-cookie"]'];

export const logger = pino({
  level: env.NODE_ENV === 'test' ? 'silent' : 'info',
  redact: LOG_REDACT_PATHS,
});
