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

describe('Mietobergrenze (Mietpreisbremse)', () => {
  it('Vergleichsmiete + 10 % + Möblierung, abgerundet', async () => {
    const { mietobergrenze } = await import('@/lib/rentalCalc');
    const g = mietobergrenze({ applies: true, reference_per_sqm: 15.38, markup_percent: 10, furnished_surcharge: 200, previous_rent: 0, source: null }, 180);
    // 15,38 × 1,1 × 180 = 3045,24 + 200 = 3245,24 → 3240
    expect(g.kalt).toBe(3240);
    expect(g.vormieteGreift).toBe(false);
  });
  it('höhere Vormiete gilt', async () => {
    const { mietobergrenze } = await import('@/lib/rentalCalc');
    const g = mietobergrenze({ applies: true, reference_per_sqm: 15.38, markup_percent: 10, furnished_surcharge: 0, previous_rent: 3520, source: null }, 180);
    expect(g.kalt).toBe(3520);
    expect(g.vormieteGreift).toBe(true);
  });
  it('nicht aktiv → keine Grenze', async () => {
    const { mietobergrenze, obergrenzeNormalisieren } = await import('@/lib/rentalCalc');
    expect(mietobergrenze(null, 180).kalt).toBeNull();
    expect(mietobergrenze(obergrenzeNormalisieren({ applies: false, reference_per_sqm: 15 }), 180).kalt).toBeNull();
  });
});

describe('preisstufe ohne Kalkulation (vermietetes Objekt)', () => {
  it('nimmt NK laut Mietvertrag und Kaution in Kaltmieten', () => {
    const s = preisstufe(3000, null, { nebenkosten: 530, kautionKaltmieten: 3 });
    expect(s).toMatchObject({ kalt: 3000, nebenkosten: 530, warm: 3530, kaution: 9000, ueberKosten: null });
  });
  it('ohne Angaben bleiben NK, Warm und Kaution leer', () => {
    expect(preisstufe(3000, null)).toMatchObject({ nebenkosten: null, warm: null, kaution: null });
  });
});
