import { Router } from 'express';
import { authenticate, currentUser, requireRole } from '../../middleware/auth.js';
import { idParam, parse } from '../../lib/validation.js';
import { createAppointmentSchema, myAppointmentsQuery, updateStatusSchema } from './appointment.schemas.js';
import * as appointments from './appointment.service.js';

export const appointmentRouter = Router();

appointmentRouter.use(authenticate);

appointmentRouter.post('/', requireRole('customer'), async (req, res) => {
  const input = parse(createAppointmentSchema, req.body);
  res.status(201).json(await appointments.createAppointment(currentUser(req).id, input));
});

appointmentRouter.get('/me', async (req, res) => {
  const query = parse(myAppointmentsQuery, req.query);
  res.json(await appointments.listMyAppointments(currentUser(req).id, query));
});

// Both the customer and the business owner use this endpoint; the allowed changes differ
appointmentRouter.patch('/:id/status', async (req, res) => {
  const { id } = parse(idParam, req.params);
  const { status } = parse(updateStatusSchema, req.body);
  res.json(await appointments.updateStatus(id, currentUser(req).id, status));
});
