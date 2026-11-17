import { describe, expect, it } from 'vitest';
import { canTransition } from '../src/modules/appointments/transitions.js';
import { slugify } from '../src/lib/slug.js';

describe('canTransition', () => {
  it('lets the owner confirm and complete', () => {
    expect(canTransition('owner', 'pending', 'confirmed')).toBe(true);
    expect(canTransition('owner', 'confirmed', 'completed')).toBe(true);
  });

  it('only lets the customer cancel', () => {
    expect(canTransition('customer', 'pending', 'cancelled')).toBe(true);
    expect(canTransition('customer', 'pending', 'confirmed')).toBe(false);
  });

  it('never changes a cancelled or completed appointment', () => {
    expect(canTransition('owner', 'cancelled', 'confirmed')).toBe(false);
    expect(canTransition('owner', 'completed', 'cancelled')).toBe(false);
  });
});

describe('slugify', () => {
  it('converts Turkish characters', () => {
    expect(slugify('Kuaför Ayşe & Çiğdem Güzellik')).toBe('kuafor-ayse-cigdem-guzellik');
    expect(slugify('İstanbul Diş Kliniği')).toBe('istanbul-dis-klinigi');
  });
});
