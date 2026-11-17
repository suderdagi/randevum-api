import { Router } from 'express';
import { authenticate, currentUser, requireRole } from '../../middleware/auth.js';
import { idParam, parse } from '../../lib/validation.js';
import {
  createBusinessSchema,
  listBusinessesQuery,
  updateBusinessSchema,
  workingHoursSchema,
} from './business.schemas.js';
import * as businesses from './business.service.js';
import { createServiceSchema } from '../services/service.schemas.js';
import * as services from '../services/service.service.js';
import { availabilityQuery, businessAppointmentsQuery } from '../appointments/appointment.schemas.js';
import * as appointments from '../appointments/appointment.service.js';

export const businessRouter = Router();

// Public
businessRouter.get('/', async (req, res) => {
  res.json(await businesses.listBusinesses(parse(listBusinessesQuery, req.query)));
});

businessRouter.get('/mine', authenticate, requireRole('owner'), async (req, res) => {
  res.json(await businesses.listOwnBusinesses(currentUser(req).id));
});

businessRouter.get('/:id', async (req, res) => {
  const { id } = parse(idParam, req.params);
  res.json(await businesses.getBusiness(id));
});

businessRouter.get('/:id/availability', async (req, res) => {
  const { id } = parse(idParam, req.params);
  const { serviceId, date } = parse(availabilityQuery, req.query);
  res.json(await appointments.getAvailability(id, serviceId, date));
});

// Owner only
businessRouter.post('/', authenticate, requireRole('owner'), async (req, res) => {
  const input = parse(createBusinessSchema, req.body);
  res.status(201).json(await businesses.createBusiness(currentUser(req).id, input));
});

businessRouter.patch('/:id', authenticate, requireRole('owner'), async (req, res) => {
  const { id } = parse(idParam, req.params);
  const input = parse(updateBusinessSchema, req.body);
  res.json(await businesses.updateBusiness(id, currentUser(req).id, input));
});

businessRouter.put('/:id/working-hours', authenticate, requireRole('owner'), async (req, res) => {
  const { id } = parse(idParam, req.params);
  const hours = parse(workingHoursSchema, req.body);
  res.json(await businesses.setWorkingHours(id, currentUser(req).id, hours));
});

businessRouter.post('/:id/services', authenticate, requireRole('owner'), async (req, res) => {
  const { id } = parse(idParam, req.params);
  const input = parse(createServiceSchema, req.body);
  res.status(201).json(await services.createService(id, currentUser(req).id, input));
});

businessRouter.get('/:id/appointments', authenticate, requireRole('owner'), async (req, res) => {
  const { id } = parse(idParam, req.params);
  const query = parse(businessAppointmentsQuery, req.query);
  res.json(await appointments.listBusinessAppointments(id, currentUser(req).id, query));
});
