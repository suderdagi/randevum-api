import { createApp } from './app.js';
import { env } from './config/env.js';
import { logger } from './lib/logger.js';
import { pool } from './db/pool.js';

const server = createApp().listen(env.PORT, () => {
  logger.info(`randevum-api listening on http://localhost:${env.PORT} (docs: /docs)`);
});

// Finish in-flight requests and close DB connections on shutdown (Docker, Kubernetes, Ctrl+C)
function shutdown(signal: string) {
  logger.info(`${signal} received, shutting down`);
  server.close(async () => {
    await pool.end();
    process.exit(0);
  });
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
