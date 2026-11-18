import { addMonths, format, parseISO, subDays } from 'date-fns';

/**
 * Mietvertrag „Wohnen auf Zeit“ (Paket D, SQL 74): Platzhalter einsetzen, fehlende Angaben finden,
 * Text für Vorschau und PDF aufbereiten. Reine Logik, keine Datenbank (die liegt in
 * hooks/useRentalContracts.ts), kein PDF (lib/rentalContractPdf.ts).
 *
 * Vorlage (rental_contract_templates.content): Absätze mit {{schluessel}}. Je Sprache wird zuerst
 * `schluessel_de` bzw. `schluessel_en` gesucht, dann `schluessel`. Ein Absatz mit `when` erscheint
 * nur, wenn der Wert gesetzt ist („!schluessel“ = nur wenn NICHT gesetzt).
 * Fehlt ein Wert, steht im Text „[Bezeichnung]“ und die Bezeichnung landet in der Liste „fehlt“.
 */

export type Lang = 'de' | 'en';

export interface TemplateParagraph { de: string; en: string; when?: string; type?: 'positions' }
export interface TemplateSection { title_de: string; title_en: string; paragraphs: TemplateParagraph[] }
export interface BiText { de: string; en: string }
export interface ContractTemplateContent {
  title_de: string; title_en: string;
  annex_de?: string; annex_en?: string;
  protocol_items?: BiText[];
  sections: TemplateSection[];
}

export interface ProtocolRow { de: string; en: string; no?: string }

/** Zeile aus rental_contract_house_data (SQL 74). */
export interface HouseContractData {
  house_id: string;
  landlord_name: string | null; landlord_address: string | null;
  landlord_email: string | null; landlord_phone: string | null;
  account_holder: string | null; iban: string | null; bic: string | null;
  object_title: string | null; object_short: string | null;
  object_de: string | null; object_en: string | null;
  mrg_note_de: string | null; mrg_note_en: string | null;
  municipality_de: string | null; municipality_en: string | null;
  registration_hint_de: string | null; registration_hint_en: string | null;
  house_rules_de: string | null; house_rules_en: string | null;
  max_occupants: number | null;
  vat_note_de: string | null; vat_note_en: string | null;
  small_repair_case: number | null; small_repair_year: number | null;
  winter_service: 'tenant' | 'landlord' | null;
  notice_after_months: number; notice_period_months: number; payment_day: number;
  energy_hwb: number | null; energy_fgee: number | null;
  energy_class: string | null; energy_issued_on: string | null;
  meters: ProtocolRow[]; keys: ProtocolRow[]; rooms: ProtocolRow[];
}

export const LEERE_HAUSDATEN = (houseId: string): HouseContractData => ({
  house_id: houseId,
  landlord_name: null, landlord_address: null, landlord_email: null, landlord_phone: null,
  account_holder: null, iban: null, bic: null,
  object_title: null, object_short: null, object_de: null, object_en: null,
  mrg_note_de: null, mrg_note_en: null, municipality_de: null, municipality_en: null,
  registration_hint_de: null, registration_hint_en: null, house_rules_de: null, house_rules_en: null,
  max_occupants: null, vat_note_de: null, vat_note_en: null,
  small_repair_case: 100, small_repair_year: 400, winter_service: null,
  notice_after_months: 6, notice_period_months: 3, payment_day: 3,
  energy_hwb: null, energy_fgee: null, energy_class: null, energy_issued_on: null,
  meters: [], keys: [], rooms: [],
});

export type PositionKind = 'rent' | 'utilities' | 'other';
export interface Position { label_de: string; label_en: string; amount: number; kind: PositionKind }

/**
 * Eingaben im Vertragsdialog (rental_contracts.values). Alles, was aus Haus/Angebot kommt, wird
 * beim Öffnen vorbelegt und ist danach änderbar.
 */
export interface ContractValues {
  mieter_name: string; mieter_geburtsdatum: string; mieter_email: string; mieter_telefon: string;
  mieter_staatsangehoerigkeit: string; mieter_ausweis: string;
  weitere_bewohner: string; aufenthaltsnachweis: boolean;
  beginn: string; dauer_monate: string; ende: string;
  positions: Position[];
  nk_vorauszahlung: boolean;
  kaution: string; kaution_zusatz: string;
  /** Text-Änderungen im Dialog: Schlüssel „Abschnitt.Absatz“ → fertiger Text */
  overrides: Record<string, BiText>;
  /** Zahltag beim Ausfertigen aus den Vertragsdaten übernommen (für „Als Mieter übernehmen“) */
  zahltag?: number;
}

export interface OfferLike {
  guest_name: string; guest_email: string | null;
  rent_month: number; utilities_month: number; utilities_mode: 'flat' | 'advance';
  deposit: number; move_in: string; duration_months: number | null;
}
export interface ApplicationLike {
  full_name?: string | null; birth_date?: string | null; adults?: number | null; children?: number | null;
}

/** Vertragsende = Beginn + Monate − 1 Tag (wie „Als Mieter übernehmen“). */
export const vertragsEnde = (beginn: string, monate: number | null) =>
  beginn && monate ? format(subDays(addMonths(parseISO(beginn), monate), 1), 'yyyy-MM-dd') : '';

export function startWerte(offer: OfferLike, app: ApplicationLike | null, phone: string | null): ContractValues {
  const positions: Position[] = [
    { label_de: 'Hauptmietzins möbliert', label_en: 'Base rent furnished', amount: Number(offer.rent_month) || 0, kind: 'rent' },
  ];
  if (Number(offer.utilities_month) > 0) {
    positions.push(offer.utilities_mode === 'flat'
      ? { label_de: 'Nebenkosten-Pauschale', label_en: 'Flat operating costs', amount: Number(offer.utilities_month), kind: 'utilities' }
      : { label_de: 'Betriebskosten-Akonto', label_en: 'Operating cost advance', amount: Number(offer.utilities_month), kind: 'utilities' });
  }
  return {
    mieter_name: app?.full_name || offer.guest_name,
    mieter_geburtsdatum: app?.birth_date ?? '',
    mieter_email: offer.guest_email ?? '',
    mieter_telefon: phone ?? '',
    mieter_staatsangehoerigkeit: '', mieter_ausweis: '',
    weitere_bewohner: '', aufenthaltsnachweis: false,
    beginn: offer.move_in,
    dauer_monate: offer.duration_months ? String(offer.duration_months) : '',
    ende: vertragsEnde(offer.move_in, offer.duration_months),
    positions,
    nk_vorauszahlung: offer.utilities_mode === 'advance',
    kaution: String(offer.deposit ?? ''), kaution_zusatz: '',
    overrides: {},
  };
}

/* ------------------------------------------------------------------ Formatierung */

export const geld = (n: number | string | null | undefined, lang: Lang) => {
  if (n === null || n === undefined || n === '' || !Number.isFinite(Number(n))) return '';
  const z = Number(n);
  return lang === 'de'
    ? `${new Intl.NumberFormat('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(z)} €`
    : `EUR ${new Intl.NumberFormat('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(z)}`;
};
const datum = (iso: string | null | undefined) => (iso ? format(parseISO(iso), 'dd.MM.yyyy') : '');
const zahl = (n: number | null | undefined, lang: Lang) =>
  n === null || n === undefined ? '' : new Intl.NumberFormat(lang === 'de' ? 'de-DE' : 'en-GB').format(Number(n));

export const summe = (p: Position[]) => p.reduce((s, x) => s + (Number(x.amount) || 0), 0);

/** Bezeichnungen für „fehlt“ (Platzhalter → Klartext). */
export const PLATZHALTER_LABEL: Record<string, string> = {
  vermieter_name: 'Vermieter Name', vermieter_anschrift: 'Vermieter Anschrift', vermieter_email: 'Vermieter E-Mail',
  vermieter_telefon: 'Vermieter Telefon', mieter_name: 'Mieter Name', mieter_geburtsdatum: 'Geburtsdatum Mieter',
  mieter_email: 'E-Mail Mieter', mieter_telefon: 'Telefon Mieter', mieter_staatsangehoerigkeit: 'Staatsangehörigkeit',
  mieter_ausweis: 'Ausweis-Nr.', weitere_bewohner: 'Weitere Bewohner', max_bewohner: 'Höchstzahl Bewohner',
  objekt: 'Objektbeschreibung', objekt_kurz: 'Kurzbezeichnung (Verwendungszweck)', objekt_titel: 'Kopfzeile Objekt',
  beginn: 'Mietbeginn', ende: 'Mietende', dauer_monate: 'Dauer', kuendigung_ab_monate: 'Kündigung ab Monat',
  kuendigung_frist_monate: 'Kündigungsfrist', mrg_hinweis: 'MRG-Hinweis', gemeinde: 'Gemeinde',
  anmeldung_hinweis: 'Anleitung Anmeldung', ust_hinweis: 'Umsatzsteuer', kontoinhaber: 'Kontoinhaber', iban: 'IBAN',
  bic: 'BIC', zahltag: 'Zahltag', kaution: 'Kaution', kleinreparatur_fall: 'Kleinreparatur je Fall',
  kleinreparatur_jahr: 'Kleinreparatur pro Jahr', hausregeln: 'Hausregeln', winterdienst: 'Winterdienst',
  energie_hwb: 'Energieausweis HWB', energie_fgee: 'Energieausweis fGEE', energie_klasse: 'Energieklasse',
  energie_datum: 'Energieausweis Datum', laufzeit_titel: 'Laufzeit',
};

/** Alle Werte, die in der Vorlage vorkommen können — je Sprache schon formatiert. */
export function platzhalterWerte(v: ContractValues, h: HouseContractData | null): Record<string, string> {
  const hd = h ?? LEERE_HAUSDATEN('');
  const monate = parseInt(v.dauer_monate) || 0;
  const r: Record<string, string> = {
    vermieter_name: hd.landlord_name ?? '', vermieter_anschrift: hd.landlord_address ?? '',
    vermieter_email: hd.landlord_email ?? '', vermieter_telefon: hd.landlord_phone ?? '',
    mieter_name: v.mieter_name, mieter_geburtsdatum: datum(v.mieter_geburtsdatum),
    mieter_email: v.mieter_email, mieter_telefon: v.mieter_telefon,
    mieter_staatsangehoerigkeit: v.mieter_staatsangehoerigkeit, mieter_ausweis: v.mieter_ausweis,
    max_bewohner: hd.max_occupants ? String(hd.max_occupants) : '',
    aufenthaltsnachweis: v.aufenthaltsnachweis ? 'ja' : '',
    objekt_de: hd.object_de ?? '', objekt_en: hd.object_en ?? '',
    objekt_kurz: hd.object_short ?? '', objekt_titel: hd.object_title ?? '',
    beginn: datum(v.beginn), ende: datum(v.ende), dauer_monate: monate ? String(monate) : '',
    befristet: monate ? 'ja' : '',
    laufzeit_titel_de: monate ? `Befristet auf ${monate} Monate` : 'Unbefristet',
    laufzeit_titel_en: monate ? `Fixed term of ${monate} months` : 'Indefinite term',
    kuendigung_ab_monate: String(hd.notice_after_months ?? ''), kuendigung_frist_monate: String(hd.notice_period_months ?? ''),
    mrg_hinweis_de: hd.mrg_note_de ?? '', mrg_hinweis_en: hd.mrg_note_en ?? '',
    gemeinde_de: hd.municipality_de ?? '', gemeinde_en: hd.municipality_en ?? '',
    anmeldung_hinweis_de: hd.registration_hint_de ?? '', anmeldung_hinweis_en: hd.registration_hint_en ?? '',
    ust_hinweis_de: hd.vat_note_de ?? '', ust_hinweis_en: hd.vat_note_en ?? '',
    nk_vorauszahlung: v.nk_vorauszahlung ? 'ja' : '',
    kontoinhaber: hd.account_holder ?? '', iban: hd.iban ?? '', bic: hd.bic ?? '',
    zahltag: String(hd.payment_day ?? ''),
    kaution_de: geld(v.kaution, 'de'), kaution_en: geld(v.kaution, 'en'),
    kaution_hinweis: v.kaution_zusatz.trim() ? ` (${v.kaution_zusatz.trim()})` : '',
    kleinreparatur_fall_de: geld(hd.small_repair_case, 'de'), kleinreparatur_fall_en: geld(hd.small_repair_case, 'en'),
    kleinreparatur_jahr_de: geld(hd.small_repair_year, 'de'), kleinreparatur_jahr_en: geld(hd.small_repair_year, 'en'),
    hausregeln_de: hd.house_rules_de ?? '', hausregeln_en: hd.house_rules_en ?? '',
    winterdienst_de: hd.winter_service === 'tenant' ? 'Mieter' : hd.winter_service === 'landlord' ? 'Vermieter' : '',
    winterdienst_en: hd.winter_service === 'tenant' ? 'Tenant' : hd.winter_service === 'landlord' ? 'Landlord' : '',
    energie_hwb_de: zahl(hd.energy_hwb, 'de'), energie_hwb_en: zahl(hd.energy_hwb, 'en'),
    energie_fgee_de: zahl(hd.energy_fgee, 'de'), energie_fgee_en: zahl(hd.energy_fgee, 'en'),
    energie_klasse: hd.energy_class ?? '', energie_datum: datum(hd.energy_issued_on),
  };
  const namen = v.weitere_bewohner.trim();
  r.weitere_bewohner_de = namen || 'keine';
  r.weitere_bewohner_en = namen || 'none';
  return r;
}

/** Platzhalter, die leer bleiben dürfen (kein Eintrag in „fehlt“). */
const OPTIONAL = new Set(['kaution_hinweis']);

const wert = (werte: Record<string, string>, key: string, lang: Lang) =>
  werte[`${key}_${lang}`] ?? werte[key] ?? '';

export function einsetzen(text: string, werte: Record<string, string>, lang: Lang, fehlt?: Set<string>) {
  return text.replace(/\{\{(\w+)\}\}/g, (_, key: string) => {
    const w = wert(werte, key, lang);
    if (w) return w;
    if (OPTIONAL.has(key)) return '';
    fehlt?.add(key);
    return `[${PLATZHALTER_LABEL[key] ?? key}]`;
  });
}

const sichtbar = (when: string | undefined, werte: Record<string, string>) => {
  if (!when) return true;
  const nicht = when.startsWith('!');
  const key = nicht ? when.slice(1) : when;
  const gesetzt = !!(wert(werte, key, 'de') || wert(werte, key, 'en'));
  return nicht ? !gesetzt : gesetzt;
};

export interface FilledParagraph { key: string; de: string; en: string; type?: 'positions'; edited?: boolean }
export interface FilledSection { title_de: string; title_en: string; paragraphs: FilledParagraph[] }

export interface FilledContract {
  title_de: string; title_en: string; subtitle: string;
  annex_de: string; annex_en: string;
  sections: FilledSection[];
  positions: Position[]; total: number;
  protocol_items: BiText[];
  missing: string[];
}

/** Vorlage + Werte → fertiger Text (Vorschau, PDF, Kopie in rental_contracts.sections). */
export function ausfuellen(t: ContractTemplateContent, v: ContractValues, h: HouseContractData | null): FilledContract {
  const werte = platzhalterWerte(v, h);
  const fehlt = new Set<string>();
  const sections = t.sections.map((s, si) => ({
    title_de: s.title_de, title_en: s.title_en,
    paragraphs: s.paragraphs
      .map((p, pi) => ({ p, key: `${si}.${pi}` }))
      .filter(({ p }) => sichtbar(p.when, werte))
      .map(({ p, key }) => {
        if (p.type === 'positions') return { key, type: 'positions' as const, de: p.de, en: p.en };
        const o = v.overrides[key];
        if (o) return { key, de: o.de, en: o.en, edited: true };
        return { key, de: einsetzen(p.de, werte, 'de', fehlt), en: einsetzen(p.en, werte, 'en', fehlt) };
      }),
  }));
  if (!v.positions.length || summe(v.positions) <= 0) fehlt.add('positionen');
  const subtitle = `${werte.laufzeit_titel_de} / ${werte.laufzeit_titel_en} – ${werte.objekt_titel || '[Kopfzeile Objekt]'}`;
  if (!werte.objekt_titel) fehlt.add('objekt_titel');
  return {
    title_de: t.title_de, title_en: t.title_en, subtitle,
    annex_de: t.annex_de ?? '', annex_en: t.annex_en ?? '',
    sections, positions: v.positions, total: summe(v.positions),
    protocol_items: t.protocol_items ?? [],
    missing: [...fehlt].map(k => (k === 'positionen' ? 'Monatliche Beträge' : PLATZHALTER_LABEL[k] ?? k)),
  };
}

/* ------------------------------------------------------------------ Inventar */

export interface InventoryItem {
  name: string; quantity: number | null; condition: string | null; location: string | null;
  category?: string | null;
}
export interface InventoryGroup { location: string; items: InventoryItem[] }

export const ZUSTAND: Record<string, string> = {
  good: 'gut / good', fair: 'gebraucht / fair', poor: 'abgenutzt / worn', broken: 'defekt / broken',
};

/** Inventar nach Ort gruppiert (house_inventory.location), innerhalb alphabetisch. */
export function inventarGruppen(items: InventoryItem[]): InventoryGroup[] {
  const map = new Map<string, InventoryItem[]>();
  for (const i of items) {
    const ort = (i.location ?? '').trim() || 'Sonstiges';
    map.set(ort, [...(map.get(ort) ?? []), i]);
  }
  return [...map.entries()]
    .sort(([a], [b]) => a.localeCompare(b, 'de'))
    .map(([location, list]) => ({ location, items: list.sort((x, y) => x.name.localeCompare(y.name, 'de')) }));
}

/** Auffällige Mengen (z. B. Tippfehler 11111) — Warnung im Dialog. */
export const auffaelligeMengen = (items: InventoryItem[]) =>
  items.filter(i => (i.quantity ?? 0) > 200);
