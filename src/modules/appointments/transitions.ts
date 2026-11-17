import type { AppointmentStatus } from './appointment.schemas.js';

type Actor = 'owner' | 'customer';

/**
 * Which status changes are allowed, and by whom.
 * Keeping the rules in one table makes them easy to read, test and change.
 */
const RULES: Record<Actor, Partial<Record<AppointmentStatus, AppointmentStatus[]>>> = {
  owner: {
    pending: ['confirmed', 'cancelled'],
    confirmed: ['cancelled', 'completed'],
  },
  customer: {
    pending: ['cancelled'],
    confirmed: ['cancelled'],
  },
};

export function canTransition(actor: Actor, from: AppointmentStatus, to: AppointmentStatus): boolean {
  return RULES[actor][from]?.includes(to) ?? false;
}
