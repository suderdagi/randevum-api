import { Router } from 'express';
import { authenticate, currentUser, requireRole } from '../../middleware/auth.js';
import { idParam, parse } from '../../lib/validation.js';
import { updateServiceSchema } from './service.schemas.js';
import * as services from './service.service.js';

export const serviceRouter = Router();

serviceRouter.use(authenticate, requireRole('owner'));

serviceRouter.patch('/:id', async (req, res) => {
  const { id } = parse(idParam, req.params);
  const input = parse(updateServiceSchema, req.body);
  res.json(await services.updateService(id, currentUser(req).id, input));
});

serviceRouter.delete('/:id', async (req, res) => {
  const { id } = parse(idParam, req.params);
  await services.deactivateService(id, currentUser(req).id);
  res.status(204).end();
});
