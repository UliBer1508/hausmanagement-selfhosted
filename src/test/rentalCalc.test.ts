import { describe, it, expect } from 'vitest';
import { berechnen, gewinnzielFuerGrundmiete, leereKalkulation, preisstufe } from '@/lib/rentalCalc';

const kalkulation = () => ({
  ...leereKalkulation('h1'),
  insurance: 1200, property_tax: 400, municipal_fees: 1800, internet: 600,
  depreciation: 6000, electricity: 1500, heating: 2400, maintenance: 2000,
  vacancy_months: 1, deposit_months: 2,
});

describe('rentalCalc Preisstufen', () => {
  it('Gewinnziel trifft die Zielmiete genau', () => {
    for (const ziel of [2400, 2600, 2800, 1000]) {
      const k = kalkulation();
      k.profit_target = gewinnzielFuerGrundmiete(k, ziel);
      expect(berechnen(k).grundmieteMonat).toBe(ziel);
    }
  });

  it('Stufe: Warmmiete = kalt + Nebenkosten, Kaution 2 Monate warm', () => {
    const k = kalkulation();
    const nk = berechnen(k).nebenkostenMonat;
    const s = preisstufe(2600, k);
    expect(s.nebenkosten).toBe(nk);
    expect(s.warm).toBe(2600 + nk);
    expect(s.kaution).toBe(Math.ceil((2 * (2600 + nk)) / 10) * 10);
    expect(s.kaltJahr).toBe(31200);
    expect(s.ueberKosten).toBeGreaterThan(0);
  });

  it('ohne Kalkulation nur Kaltmiete', () => {
    const s = preisstufe(2400, null);
    expect(s).toMatchObject({ kalt: 2400, nebenkosten: null, warm: null, kaution: null, kaltJahr: 28800 });
  });
});
