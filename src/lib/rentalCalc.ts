/**
 * Interne Mietkalkulation „Wohnen auf Zeit“ (public.rental_calculations).
 * Nur in der Hausverwaltung benutzt — die Ergebnisse erscheinen nie auf der öffentlichen Website.
 *
 * Rechenweg (Entscheidung 18.11.2026, im Admin jederzeit überschreibbar):
 *   Kosten/Jahr          = Summe aller Posten
 *   vermietete Monate    = 12 − Leerstand
 *   Monatsmiete gesamt   = (Kosten/Jahr + Gewinnziel) / vermietete Monate
 *   Nebenkosten/Monat    = Nebenkosten-Posten/Jahr / 12   (Kanal/Müll/Wasser, Internet,
 *                          Strom, Heizung, Zusatzposten mit Häkchen „Nebenkosten“)
 *   Grundmiete/Monat     = Monatsmiete gesamt − Nebenkosten/Monat
 *   Kaution              = Kaution-Monate × (Grundmiete + Nebenkosten)
 * Rundung: Grundmiete und Kaution auf volle 10 €, Nebenkosten auf volle 5 € (jeweils aufwärts).
 */

export interface ExtraCost {
  name: string;
  amount: number;
  /** true = zählt zu den Nebenkosten (Pauschale/Vorauszahlung) */
  utility: boolean;
}

export interface RentalCalculation {
  house_id: string;
  insurance: number;
  property_tax: number;
  municipal_fees: number;
  internet: number;
  financing: number;
  depreciation: number;
  electricity: number;
  heating: number;
  maintenance: number;
  furniture_wear: number;
  management: number;
  cleaning: number;
  extra_costs: ExtraCost[];
  vacancy_months: number;
  profit_target: number;
  deposit_months: number;
  final_cleaning_fee: number;
  utilities_mode: "flat" | "advance";
  note: string | null;
}

export type BetragFeld =
  | "insurance" | "property_tax" | "municipal_fees" | "internet" | "financing" | "depreciation"
  | "electricity" | "heating" | "maintenance" | "furniture_wear" | "management" | "cleaning";

/** Beschriftung und Gruppe je Kostenposten (Admin ist nur Deutsch). */
export const KOSTENPOSTEN: { feld: BetragFeld; label: string; gruppe: "fix" | "energie" | "betrieb"; nebenkosten: boolean }[] = [
  { feld: "insurance", label: "Versicherungen", gruppe: "fix", nebenkosten: false },
  { feld: "property_tax", label: "Grundsteuer", gruppe: "fix", nebenkosten: false },
  { feld: "municipal_fees", label: "Kanal, Müll, Wasser", gruppe: "fix", nebenkosten: true },
  { feld: "internet", label: "Internet / TV", gruppe: "fix", nebenkosten: true },
  { feld: "financing", label: "Finanzierung", gruppe: "fix", nebenkosten: false },
  { feld: "depreciation", label: "AfA", gruppe: "fix", nebenkosten: false },
  { feld: "electricity", label: "Strom (nach PV-Anteil)", gruppe: "energie", nebenkosten: true },
  { feld: "heating", label: "Heizung (nach PV-Anteil)", gruppe: "energie", nebenkosten: true },
  { feld: "maintenance", label: "Instandhaltung", gruppe: "betrieb", nebenkosten: false },
  { feld: "furniture_wear", label: "Abnutzung Möbel / Inventar", gruppe: "betrieb", nebenkosten: false },
  { feld: "management", label: "Verwaltung", gruppe: "betrieb", nebenkosten: false },
  { feld: "cleaning", label: "Reinigung / Garten während der Mietzeit", gruppe: "betrieb", nebenkosten: false },
];

export const leereKalkulation = (houseId: string): RentalCalculation => ({
  house_id: houseId,
  insurance: 0, property_tax: 0, municipal_fees: 0, internet: 0, financing: 0, depreciation: 0,
  electricity: 0, heating: 0, maintenance: 0, furniture_wear: 0, management: 0, cleaning: 0,
  extra_costs: [], vacancy_months: 1, profit_target: 0, deposit_months: 2, final_cleaning_fee: 0,
  utilities_mode: "flat", note: null,
});

const n = (v: unknown) => {
  const z = typeof v === "number" ? v : parseFloat(String(v ?? "").replace(",", "."));
  return Number.isFinite(z) ? z : 0;
};

/** Datenbankzeile → saubere Zahlen. */
export const normalisieren = (row: any, houseId: string): RentalCalculation => {
  const k = leereKalkulation(houseId);
  if (!row) return k;
  KOSTENPOSTEN.forEach(({ feld }) => { k[feld] = n(row[feld]); });
  k.extra_costs = Array.isArray(row.extra_costs)
    ? row.extra_costs.map((e: any) => ({ name: String(e?.name ?? ""), amount: n(e?.amount), utility: !!e?.utility }))
    : [];
  k.vacancy_months = n(row.vacancy_months ?? 1);
  k.profit_target = n(row.profit_target);
  k.deposit_months = n(row.deposit_months ?? 2);
  k.final_cleaning_fee = n(row.final_cleaning_fee);
  k.utilities_mode = row.utilities_mode === "advance" ? "advance" : "flat";
  k.note = row.note ?? null;
  return k;
};

const auf = (wert: number, schritt: number) => (wert <= 0 ? 0 : Math.ceil(wert / schritt) * schritt);

export interface Ergebnis {
  fix: number;
  energie: number;
  betrieb: number;
  zusatz: number;
  kostenJahr: number;
  nebenkostenJahr: number;
  vermieteteMonate: number;
  /** Monatsmiete gesamt ohne Gewinn (deckt nur die Kosten) */
  kostendeckend: number;
  nebenkostenMonat: number;
  grundmieteMonat: number;
  gesamtMonat: number;
  kaution: number;
  /** Ertrag pro Jahr bei der vorgeschlagenen Miete und dem angenommenen Leerstand */
  ertragJahr: number;
}

export const berechnen = (k: RentalCalculation): Ergebnis => {
  const summe = (gruppe: "fix" | "energie" | "betrieb") =>
    KOSTENPOSTEN.filter(p => p.gruppe === gruppe).reduce((s, p) => s + n(k[p.feld]), 0);
  const fix = summe("fix");
  const energie = summe("energie");
  const betrieb = summe("betrieb");
  const zusatz = k.extra_costs.reduce((s, e) => s + n(e.amount), 0);
  const kostenJahr = fix + energie + betrieb + zusatz;
  const nebenkostenJahr =
    KOSTENPOSTEN.filter(p => p.nebenkosten).reduce((s, p) => s + n(k[p.feld]), 0) +
    k.extra_costs.filter(e => e.utility).reduce((s, e) => s + n(e.amount), 0);

  const vermieteteMonate = Math.max(0.5, 12 - n(k.vacancy_months));
  const kostendeckend = kostenJahr / vermieteteMonate;
  const gesamtRoh = (kostenJahr + n(k.profit_target)) / vermieteteMonate;
  const nebenkostenMonat = auf(nebenkostenJahr / 12, 5);
  const grundmieteMonat = auf(Math.max(0, gesamtRoh - nebenkostenMonat), 10);
  const gesamtMonat = grundmieteMonat + nebenkostenMonat;
  const kaution = auf(n(k.deposit_months) * gesamtMonat, 10);
  const ertragJahr = gesamtMonat * vermieteteMonate - kostenJahr;

  return {
    fix, energie, betrieb, zusatz, kostenJahr, nebenkostenJahr, vermieteteMonate,
    kostendeckend, nebenkostenMonat, grundmieteMonat, gesamtMonat, kaution, ertragJahr,
  };
};

export const euro = (wert: number, sprache: "de" | "en" = "de") =>
  new Intl.NumberFormat(sprache === "en" ? "en-IE" : "de-AT", {
    style: "currency", currency: "EUR", maximumFractionDigits: 2, minimumFractionDigits: 0,
  }).format(wert);

/**
 * Preisstufe aus der KI-Analyse (23.11.2026): Kaltmiete → Nebenkosten, Warmmiete, Kaution,
 * Abstand zu den Kosten. Nebenkosten und Kaution-Monate kommen aus der Kalkulation;
 * ohne Kalkulation sind diese Felder null.
 */
export interface Preisstufe {
  kalt: number;
  nebenkosten: number | null;
  warm: number | null;
  kaution: number | null;
  /** Kaltmiete minus kostendeckende Kaltmiete (pro Monat) */
  ueberKosten: number | null;
  kaltJahr: number;
}

export const preisstufe = (kalt: number, k: RentalCalculation | null): Preisstufe => {
  if (!k) return { kalt, nebenkosten: null, warm: null, kaution: null, ueberKosten: null, kaltJahr: kalt * 12 };
  const e = berechnen(k);
  const warm = kalt + e.nebenkostenMonat;
  return {
    kalt,
    nebenkosten: e.nebenkostenMonat,
    warm,
    kaution: auf(n(k.deposit_months) * warm, 10),
    ueberKosten: Math.round(kalt - Math.max(0, e.kostendeckend - e.nebenkostenMonat)),
    kaltJahr: kalt * 12,
  };
};

/**
 * Gewinnziel, mit dem `berechnen()` genau die gewünschte Grundmiete (kalt) liefert —
 * so wird eine KI-Stufe „als Zielmiete übernommen", ohne ein zweites Mietfeld einzuführen.
 * Umkehrung von: grundmiete = auf((kostenJahr + gewinn) / vermieteteMonate − nebenkosten, 10).
 * Kann negativ sein (Zielmiete unter Kosten).
 */
export const gewinnzielFuerGrundmiete = (k: RentalCalculation, zielKalt: number): number => {
  const e = berechnen(k);
  // −0,01 €: Aufrundung auf volle 10 € soll exakt bei der Zielmiete landen, nicht 10 € darüber
  const gewinn = (zielKalt + e.nebenkostenMonat) * e.vermieteteMonate - e.kostenJahr - 0.01;
  return Math.round(gewinn * 100) / 100;
};
