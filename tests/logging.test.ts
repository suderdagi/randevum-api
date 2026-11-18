import { Writable } from 'node:stream';
import express from 'express';
import pino from 'pino';
import { pinoHttp } from 'pino-http';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { LOG_REDACT_PATHS } from '../src/lib/logger.js';

describe('request logging', () => {
  it('never writes the Authorization header to the logs', async () => {
    let output = '';
    const stream = new Writable({
      write(chunk, _encoding, callback) {
        output += chunk.toString();
        callback();
      },
    });

    const app = express();
    app.use(pinoHttp({ logger: pino({ redact: LOG_REDACT_PATHS }, stream) }));
    app.get('/ping', (_req, res) => res.json({ ok: true }));

    await request(app).get('/ping').set('Authorization', 'Bearer SECRET-TOKEN-123').expect(200);
    await new Promise((resolve) => setImmediate(resolve)); // pino-http logs once the response has finished

    expect(output).toContain('"url":"/ping"'); // the request itself is still logged
    expect(output).not.toContain('SECRET-TOKEN-123');
  });
});
