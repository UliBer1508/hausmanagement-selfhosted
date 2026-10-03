import { describe, it, expect } from 'vitest';
import type { LaundryArticle } from '@/hooks/useLaundryArticles';
import type { SetZeilen } from '@/lib/linenPricing';
import {
  bildeAbgleich,
  planeAngleichung,
  setzeEntscheidungenUm,
  offeneEntscheidungen,
  leereEntscheidung,
  entscheidungsKey,
  type AbgleichPosition,
  type Entscheidung,
} from '@/lib/rechnungsAbgleich';

/*
 * Fall RG-122 (Teuni, 30.09.2026), Tal Yehuda, Venediger, 7 Gaeste:
 * Wäschekarte 77,30 EUR, Rechnung 93,90 EUR.
 *
 * Das Wäscheset ist hier nachgebaut, wie es die Doku beschreibt (Venediger,
 * fuenf Zeilen). Die echten custom_categories liegen in der Datenbank und
 * wurden nicht gelesen — die Tests pruefen die Logik, nicht die Stammdaten.
 */

const art = (p: Partial<LaundryArticle> & Pick<LaundryArticle, 'id' | 'artikelnummer'>): LaundryArticle => ({
  bezeichnung: null, einheit: 'Stk', farbe: null, status: 'bestaetigt',
  nachfolger_id: null, nachfolger_nummer: null, set_faehig: true,
  abrechnungsart: 'stueck', preis: null, gueltig_ab: null, ...p,
});

const ARTIKEL: LaundryArticle[] = [
  art({ id: 'a-mw3', artikelnummer: 'MW3', nachfolger_id: 'a-mw4', abrechnungsart: 'paket', preis: 9 }),
  art({ id: 'a-mw4', artikelnummer: 'MW4', bezeichnung: 'Mietwäsche Paket 5 Tlg', abrechnungsart: 'paket', preis: 9.5 }),
  art({ id: 'a-mwht', artikelnummer: 'MWHT', bezeichnung: 'Mietwäsche Handtuch', preis: 1.5 }),
  art({ id: 'a-mwbvl', artikelnummer: 'MWBVL', bezeichnung: 'Mietwäsche Badevorleger', preis: 1.1 }),
  art({ id: 'a-mwst', artikelnummer: 'MWST', bezeichnung: 'Mietwäsche Saunatuch', preis: 2.8 }),
  art({ id: 'a-klgew', artikelnummer: 'KLGEW', set_faehig: false, preis: 0 }),
  art({ id: 'a-wt3', artikelnummer: 'WT3', einheit: 'kg', set_faehig: false, preis: 3 }),
];

const VENEDIGER: SetZeilen = {
  bettwaesche: {
    label: 'Bettwäsche', quantity: 1, calculation_type: 'per_guest', active: true,
    external_artikelnummer: { default: 'MW4' }, preis_zaehlt: true,
    alte_schluessel: ['bedding', 'pillow_cases', 'spannbetttuch', 'large_towels', 'small_towels'],
  },
  geschirrtuecher: {
    label: 'Geschirrtücher', quantity: 2, calculation_type: 'per_booking', active: true,
    external_artikelnummer: { default: 'MWHT' }, alte_schluessel: ['kitchen_towels'],
  },
  wb_handtuecher: {
    label: 'WB-Handtücher', quantity: 3, calculation_type: 'per_booking', active: true,
    external_artikelnummer: { default: 'MWHT' }, alte_schluessel: ['sink_towels'],
  },
  badvorleger: {
    label: 'Badvorleger', quantity: 3, calculation_type: 'per_booking', active: true,
    external_artikelnummer: { default: 'MWBVL' }, alte_schluessel: ['bath_mats'],
  },
  saunatuecher: {
    label: 'Saunatücher', quantity: 1, calculation_type: 'per_guest', active: true,
    availability: 'seasonal', season: 'winter',
    external_artikelnummer: { default: 'MWST' }, alte_schluessel: ['sauna_towels'],
  },
};

const RG122: AbgleichPosition[] = [
  { artikel: 'MW4', bezeichnung: 'Mietwäsche Paket 5 Tlg', menge: 7, einheit: 'Stk', preis: 9.5, summe: 66.5 },
  { artikel: 'MWHT', bezeichnung: 'Mietwäsche Handtuch', menge: 3, einheit: 'Stk', preis: 1.5, summe: 4.5 },
  { artikel: 'MWBVL', bezeichnung: 'Mietwäsche Badevorleger', menge: 3, einheit: 'Stk', preis: 1.1, summe: 3.3 },
  { artikel: 'KLGEW', bezeichnung: 'Kleingewerbe', menge: 1, einheit: 'Stk', preis: 0, summe: 0 },
  { artikel: 'MWST', bezeichnung: 'Mietwäsche Saunatuch', menge: 7, einheit: 'Stk', preis: 2.8, summe: 19.6 },
];

const BESTELLUNG = {
  id: 'o-1',
  house_id: 'h-venediger',
  items: { bettwaesche: 7, geschirrtuecher: 2, wb_handtuecher: 3, badvorleger: 3 } as Record<string, number>,
};
const SETS = { 'h-venediger': VENEDIGER };

describe('bildeAbgleich — Fall RG-122', () => {
  const erg = bildeAbgleich(RG122, [BESTELLUNG], SETS, ARTIKEL);
  const zeile = (nr: string) => erg.zeilen.find((z) => z.artikelnummer === nr)!;

  it('zerlegt die 16,60 EUR Differenz in Saunatücher und Handtücher', () => {
    const summe = erg.zeilen.reduce((s, z) => s + z.betragDiff, 0);
    expect(Math.round(summe * 100) / 100).toBe(16.6);
    expect(zeile('MWST').betragDiff).toBe(19.6);
    expect(zeile('MWHT').betragDiff).toBe(-3);
  });

  it('meldet nur die abweichenden Artikel', () => {
    expect(erg.zeilen.filter((z) => z.abweichung).map((z) => z.artikelnummer).sort())
      .toEqual(['MWHT', 'MWST']);
  });

  it('MWHT: System zählt 5 (Geschirr + WB), Teuni berechnet 3', () => {
    expect(zeile('MWHT').soll.menge).toBe(5);
    expect(zeile('MWHT').rechnung.menge).toBe(3);
    expect(zeile('MWHT').mengeDiff).toBe(-2);
  });

  it('Paket und Badvorleger stimmen', () => {
    expect(zeile('MW4').abweichung).toBe(false);
    expect(zeile('MWBVL').abweichung).toBe(false);
  });

  it('überspringt die Nullzeile (KLGEW)', () => {
    expect(erg.uebersprungen).toEqual(['KLGEW']);
  });
});

describe('bildeAbgleich — Sonderfälle', () => {
  it('löst die Nachfolgerkette auf (MW3 auf der Rechnung = MW4 im Set)', () => {
    const alt: AbgleichPosition[] = [
      { artikel: 'mw3', bezeichnung: 'Paket', menge: 7, einheit: 'Stk', preis: 9.5, summe: 66.5 },
    ];
    const erg = bildeAbgleich(alt, [{ ...BESTELLUNG, items: { bettwaesche: 7 } }], SETS, ARTIKEL);
    expect(erg.zeilen).toHaveLength(1);
    expect(erg.zeilen[0].artikelnummer).toBe('MW4');
    expect(erg.zeilen[0].abweichung).toBe(false);
  });

  it('meldet Bestelltes, das nicht auf der Rechnung steht', () => {
    const ohneBadvorleger = RG122.filter((p) => p.artikel !== 'MWBVL');
    const erg = bildeAbgleich(ohneBadvorleger, [BESTELLUNG], SETS, ARTIKEL);
    const z = erg.zeilen.find((x) => x.artikelnummer === 'MWBVL')!;
    expect(z.rechnung.menge).toBe(0);
    expect(z.soll.menge).toBe(3);
    expect(z.abweichung).toBe(true);
  });

  it('erkennt eine reine Preisänderung', () => {
    const teurer = RG122.map((p) => (p.artikel === 'MWBVL' ? { ...p, preis: 1.2, summe: 3.6 } : p));
    const z = bildeAbgleich(teurer, [BESTELLUNG], SETS, ARTIKEL).zeilen.find((x) => x.artikelnummer === 'MWBVL')!;
    expect(z.nurPreis).toBe(true);
    expect(z.abweichung).toBe(true);
    expect(z.mengeDiff).toBe(0);
  });

  it('kennzeichnet einen Artikel, der nicht im Sortiment steht', () => {
    const neu: AbgleichPosition[] = [
      { artikel: 'XYZ9', bezeichnung: 'Neu', menge: 2, einheit: 'Stk', preis: 5, summe: 10 },
    ];
    const z = bildeAbgleich(neu, [BESTELLUNG], SETS, ARTIKEL).zeilen.find((x) => x.artikelnummer === 'XYZ9')!;
    expect(z.unbekannt).toBe(true);
    expect(z.abweichung).toBe(true);
  });

  it('ohne gewählte Bestellung weicht jede Zeile ab', () => {
    const erg = bildeAbgleich(RG122, [], SETS, ARTIKEL);
    expect(erg.zeilen.filter((z) => z.abweichung)).toHaveLength(4);
  });
});

describe('planeAngleichung', () => {
  const erg = bildeAbgleich(RG122, [BESTELLUNG], SETS, ARTIKEL);
  const z = (nr: string) => erg.zeilen.find((x) => x.artikelnummer === nr)!;
  const soll = (nr: string) => erg.jeBestellung['o-1'][nr].menge;

  it('ergänzt die 7 Saunatücher und rechnet Teile und Kosten neu', () => {
    const r = planeAngleichung({
      zeile: z('MWST'), items: BESTELLUNG.items, sollMengeBestellung: 0,
      setZeilen: VENEDIGER, artikel: ARTIKEL,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.plan.items.saunatuecher).toBe(7);
    expect(r.plan.totalItems).toBe(22);
    expect(r.plan.totalCost).toBe(96.9);
    // Ausgangsobjekt bleibt unberührt
    expect(BESTELLUNG.items.saunatuecher).toBeUndefined();
  });

  it('verweigert MWHT: steht im Set auf zwei Zeilen', () => {
    const r = planeAngleichung({
      zeile: z('MWHT'), items: BESTELLUNG.items, sollMengeBestellung: soll('MWHT'),
      setZeilen: VENEDIGER, artikel: ARTIKEL,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect((r as { ok: false; grund: string }).grund).toMatch(/2 Zeilen/);
  });

  it('verweigert bei reiner Preisabweichung', () => {
    const teurer = RG122.map((p) => (p.artikel === 'MWBVL' ? { ...p, preis: 1.2, summe: 3.6 } : p));
    const e2 = bildeAbgleich(teurer, [BESTELLUNG], SETS, ARTIKEL);
    const r = planeAngleichung({
      zeile: e2.zeilen.find((x) => x.artikelnummer === 'MWBVL')!, items: BESTELLUNG.items,
      sollMengeBestellung: 3, setZeilen: VENEDIGER, artikel: ARTIKEL,
    });
    expect(r.ok).toBe(false);
  });

  it('skaliert das Paket: 8 statt 7 Pakete', () => {
    const acht = RG122.map((p) => (p.artikel === 'MW4' ? { ...p, menge: 8, summe: 76 } : p));
    const e2 = bildeAbgleich(acht, [BESTELLUNG], SETS, ARTIKEL);
    const r = planeAngleichung({
      zeile: e2.zeilen.find((x) => x.artikelnummer === 'MW4')!, items: BESTELLUNG.items,
      sollMengeBestellung: 7, setZeilen: VENEDIGER, artikel: ARTIKEL,
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.plan.items.bettwaesche).toBe(8);
      // Per-Booking-Zeilen bleiben unberührt
      expect(r.plan.items.badvorleger).toBe(3);
    }
  });

  it('skaliert auch Bestellungen mit alten Schlüsseln', () => {
    const alt = { bedding: 7, pillow_cases: 7, spannbetttuch: 7, large_towels: 7, small_towels: 7 };
    const acht = [{ artikel: 'MW4', bezeichnung: 'P', menge: 8, einheit: 'Stk', preis: 9.5, summe: 76 }];
    const e2 = bildeAbgleich(acht, [{ ...BESTELLUNG, items: alt }], SETS, ARTIKEL);
    const r = planeAngleichung({
      zeile: e2.zeilen[0], items: alt, sollMengeBestellung: 7, setZeilen: VENEDIGER, artikel: ARTIKEL,
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(Object.values(r.plan.items)).toEqual([8, 8, 8, 8, 8]);
  });

  it('weniger Saunatücher als bestellt: Menge sinkt, bei 0 entfällt der Eintrag', () => {
    const mit = { ...BESTELLUNG.items, saunatuecher: 7 };
    const e2 = bildeAbgleich(RG122.filter((p) => p.artikel !== 'MWST'), [{ ...BESTELLUNG, items: mit }], SETS, ARTIKEL);
    const r = planeAngleichung({
      zeile: e2.zeilen.find((x) => x.artikelnummer === 'MWST')!, items: mit,
      sollMengeBestellung: 7, setZeilen: VENEDIGER, artikel: ARTIKEL,
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect('saunatuecher' in r.plan.items).toBe(false);
  });
});

describe('Entscheidungen', () => {
  const erg = bildeAbgleich(RG122, [BESTELLUNG], SETS, ARTIKEL);
  const key = (nr: string) => entscheidungsKey(erg.zeilen.find((x) => x.artikelnummer === nr)!);

  it('meldet offene Entscheidungen, bis alles entschieden ist', () => {
    expect(offeneEntscheidungen(erg, {})).toHaveLength(2);

    const teilweise: Record<string, Entscheidung> = {
      [key('MWST')]: { art: 'angleichen', grund: '', bestellungId: 'o-1' },
    };
    expect(offeneEntscheidungen(erg, teilweise)).toHaveLength(1);

    const ohneGrund: Record<string, Entscheidung> = {
      ...teilweise,
      [key('MWHT')]: { art: 'akzeptieren', grund: ' ', bestellungId: '' },
    };
    expect(offeneEntscheidungen(erg, ohneGrund)).toEqual(['MWHT: Begründung fehlt']);

    const fertig: Record<string, Entscheidung> = {
      ...teilweise,
      [key('MWHT')]: { art: 'akzeptieren', grund: 'Geschirrtücher klären wir mit Teuni', bestellungId: '' },
    };
    expect(offeneEntscheidungen(erg, fertig)).toEqual([]);
  });

  it('setzt "angleichen" und "akzeptieren" in Änderungen und Protokoll um', () => {
    const entscheidungen: Record<string, Entscheidung> = {
      [key('MWST')]: { art: 'angleichen', grund: '', bestellungId: 'o-1' },
      [key('MWHT')]: { art: 'akzeptieren', grund: 'Geschirrtücher klären wir mit Teuni', bestellungId: '' },
    };
    const u = setzeEntscheidungenUm({
      abgleich: erg, entscheidungen, bestellungen: [BESTELLUNG], setZeilenJeHaus: SETS, artikel: ARTIKEL,
    });
    expect(u.gescheitert).toEqual([]);
    expect(u.aenderungen['o-1'].items.saunatuecher).toBe(7);
    expect(u.protokoll.map((p) => [p.artikelnummer, p.ergebnis]).sort()).toEqual([
      ['MW4', 'gleich'], ['MWBVL', 'gleich'], ['MWHT', 'akzeptiert'], ['MWST', 'angeglichen'],
    ]);
  });

  it('meldet eine unmögliche Angleichung als gescheitert und protokolliert sie als akzeptiert', () => {
    const entscheidungen: Record<string, Entscheidung> = {
      [key('MWST')]: { art: 'angleichen', grund: '', bestellungId: 'o-1' },
      [key('MWHT')]: { art: 'angleichen', grund: '', bestellungId: 'o-1' },
    };
    const u = setzeEntscheidungenUm({
      abgleich: erg, entscheidungen, bestellungen: [BESTELLUNG], setZeilenJeHaus: SETS, artikel: ARTIKEL,
    });
    expect(u.gescheitert.map((g) => g.artikelnummer)).toEqual(['MWHT']);
    expect(u.protokoll.find((p) => p.artikelnummer === 'MWHT')!.ergebnis).toBe('akzeptiert');
    expect(u.aenderungen['o-1'].items.saunatuecher).toBe(7);
  });

  it('leereEntscheidung ist unentschieden', () => {
    expect(leereEntscheidung().art).toBe('');
  });
});
