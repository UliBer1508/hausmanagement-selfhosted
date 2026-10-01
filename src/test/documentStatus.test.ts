import { describe, it, expect } from 'vitest';
import { dokumentStatus, type StatusEingabe } from '@/lib/documentStatus';

const basis: StatusEingabe = {
  pruefung: 'zahlung', zahlart: null, faellig_am: null, bezahlt_am: null,
  rechnung: null, buchung: null, heute: '2026-10-01',
};

describe('dokumentStatus', () => {
  it('ohne Pruefung kein Status', () => {
    expect(dokumentStatus({ ...basis, pruefung: 'keine' })).toBeNull();
  });

  it('Provider-Rechnung hat Vorrang vor den Feldern am Dokument', () => {
    const s = dokumentStatus({
      ...basis, bezahlt_am: null, zahlart: 'einzug',
      rechnung: { status: 'bezahlt', bezahlt_am: '2026-09-12', faelligkeitsdatum: null },
    });
    expect(s?.zustand).toBe('bezahlt');
    expect(s?.text).toBe('bezahlt 12.09.2026');
    expect(s?.offen).toBe(false);
  });

  it('offene Provider-Rechnung mit abgelaufener Faelligkeit ist ueberfaellig', () => {
    const s = dokumentStatus({
      ...basis, rechnung: { status: 'offen', bezahlt_am: null, faelligkeitsdatum: '2026-09-15' },
    });
    expect(s?.zustand).toBe('ueberfaellig');
    expect(s?.offen).toBe(true);
  });

  it('stornierte Rechnung ist nicht offen', () => {
    const s = dokumentStatus({ ...basis, rechnung: { status: 'storniert', bezahlt_am: null, faelligkeitsdatum: null } });
    expect(s?.zustand).toBe('storniert');
    expect(s?.offen).toBe(false);
  });

  it('Einzug zaehlt nicht als offen', () => {
    const s = dokumentStatus({ ...basis, zahlart: 'einzug', faellig_am: '2026-09-01' });
    expect(s?.zustand).toBe('einzug');
    expect(s?.offen).toBe(false);
  });

  it('Ueberweisung ohne Datum: offen, nach Faelligkeit ueberfaellig, am Faelligkeitstag noch offen', () => {
    expect(dokumentStatus({ ...basis, zahlart: 'ueberweisung' })?.zustand).toBe('offen');
    expect(dokumentStatus({ ...basis, faellig_am: '2026-09-30' })?.zustand).toBe('ueberfaellig');
    expect(dokumentStatus({ ...basis, faellig_am: '2026-10-01' })?.zustand).toBe('offen');
  });

  it('bezahlt_am am Dokument schlaegt Einzug', () => {
    expect(dokumentStatus({ ...basis, zahlart: 'einzug', bezahlt_am: '2026-09-20' })?.zustand).toBe('bezahlt');
  });

  it('Buchung erfasst / fehlt', () => {
    const erfasst = dokumentStatus({
      ...basis, pruefung: 'buchung',
      buchung: { id: 'b', check_in: '2027-07-10', gast: 'Christoffer Krellwitz' },
    });
    expect(erfasst?.zustand).toBe('erfasst');
    expect(erfasst?.text).toBe('erfasst · 10.07.2027 · Christoffer Krellwitz');
    const fehlt = dokumentStatus({ ...basis, pruefung: 'buchung' });
    expect(fehlt?.zustand).toBe('fehlt');
    expect(fehlt?.offen).toBe(true);
  });
});
