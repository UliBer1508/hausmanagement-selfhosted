import { describe, it, expect, vi } from 'vitest';

// useLegalCases.ts importiert den Supabase-Client; für die reine Rechnung nicht nötig.
vi.mock('@/integrations/supabase/client', () => ({ supabase: {} }));

import { buildPropertyIssues, type PropertyIssueInput } from '@/lib/propertyIssues';
import { calculateArrears } from '@/lib/tenantArrears';

const today = new Date(2026, 10, 22); // 22.11.2026, lokal

const base = (over: Partial<PropertyIssueInput> = {}): PropertyIssueInput => ({
  house: {
    id: 'h1',
    name: 'Testwohnung',
    rental_type: 'long_term',
    tenant_info: { tenant_name: 'Mieter', monthly_rent: 1000, additional_costs: 200, contract_start: '2024-09-01' },
  },
  payments: [],
  rentChanges: [],
  statements: [{ house_id: 'h1', year: 2025, status: 'sent', sent_at: '2026-03-01' }],
  country: null,
  inquiries: [],
  legalCases: [],
  today,
  ...over,
});

describe('calculateArrears', () => {
  it('zählt nur fällige offene Monatsmieten und zieht Sonderzahlungen ab', () => {
    const r = calculateArrears([
      { amount: 1000, status: 'overdue', due_date: '2026-09-03', payment_type: 'rent' },
      { amount: 1000, status: 'pending', due_date: '2026-11-03', payment_type: 'rent' },
      { amount: 1000, status: 'pending', due_date: '2026-12-03', payment_type: 'rent' }, // noch nicht fällig
      { amount: 1000, status: 'paid', due_date: '2026-10-03', payment_type: 'rent' },
      { amount: 300, status: 'paid', due_date: '2026-10-10', payment_date: '2026-10-10', payment_type: 'special' },
    ], '2026-11-22');
    expect(r).toEqual({ months: 2, openTotal: 2000, specialTotal: 300, rest: 1700, earliest: '2026-09-03' });
  });

  it('liefert null ohne offene Miete', () => {
    expect(calculateArrears([], '2026-11-22')).toBeNull();
  });
});

describe('buildPropertyIssues', () => {
  it('alles erledigt → ok', () => {
    const r = buildPropertyIssues(base());
    expect(r.level).toBe('ok');
    expect(r.issues).toHaveLength(0);
    expect(r.activeRent).toBe(1000);
  });

  it('Rückstand ist kritisch und nennt das laufende Verfahren', () => {
    const r = buildPropertyIssues(base({
      payments: [{ amount: 1200, status: 'overdue', due_date: '2026-10-03', payment_type: 'rent' }],
      legalCases: [{ house_id: 'h1', title: 'Klage', case_type: 'raeumungsklage', status: 'verhandlung' }],
    }));
    expect(r.level).toBe('danger');
    expect(r.issues[0].key).toBe('arrears');
    expect(r.issues[0].detail).toContain('Räumungsklage');
    expect(r.issues.some(i => i.key.startsWith('case-'))).toBe(false);
  });

  it('NK-Abrechnung Vorjahr nicht versendet → To-do mit Frist 31.12.', () => {
    const r = buildPropertyIssues(base({ statements: [{ house_id: 'h1', year: 2025, status: 'draft', sent_at: null }] }));
    const i = r.issues.find(x => x.key === 'utility-statement');
    expect(i?.title).toBe('NK-Abrechnung 2025 noch nicht versendet');
    expect(i?.level).toBe('warning');
    expect(i?.detail).toContain('31.12.2026');
  });

  it('fehlende NK-Abrechnung unter 30 Tage vor Frist → kritisch', () => {
    const r = buildPropertyIssues(base({ statements: [], today: new Date(2026, 11, 10) }));
    expect(r.issues.find(x => x.key === 'utility-statement')?.level).toBe('danger');
  });

  it('leer stehend mit Anfrage', () => {
    const r = buildPropertyIssues(base({
      house: { id: 'h1', name: 'Chalet', rental_type: 'long_term', tenant_info: { tenant_name: '' } },
      inquiries: [{ house_id: 'h1', status: 'new', move_in: '2026-12-01', seen_at: null }],
    }));
    expect(r.vacant).toBe(true);
    expect(r.issues[0].title).toBe('Leer stehend');
    expect(r.issues[0].detail).toContain('1 offene Anfrage (1 neu)');
    expect(r.issues[0].detail).toContain('01.12.2026');
  });

  it('gültige Miete berücksichtigt Mietänderungen', () => {
    const r = buildPropertyIssues(base({
      rentChanges: [{ id: 'c1', house_id: 'h1', effective_date: '2026-01-01', new_rent: 1100, new_additional_costs: 250 }],
    }));
    expect(r.activeRent).toBe(1100);
    expect(r.activeAdditionalCosts).toBe(250);
  });

  it('touristisch: nur Verfahren, keine Mietprüfungen', () => {
    const r = buildPropertyIssues(base({
      house: { id: 'h1', name: 'Chalet', rental_type: 'tourist', tenant_info: null },
      statements: [],
      legalCases: [{ house_id: 'h1', title: 'Bauamt', case_type: 'behoerde', status: 'offen' }],
    }));
    expect(r.issues.map(i => i.key)).toEqual(['case-0']);
    expect(r.level).toBe('info');
  });
});
