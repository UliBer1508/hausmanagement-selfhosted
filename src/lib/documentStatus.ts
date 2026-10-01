/**
 * documentStatus.ts — Ist das, wofuer ein Dokument steht, erledigt?
 *
 * Reine Logik, keine Abfragen. Die Daten liefert useDocuments().
 *
 * Seit 01.10.2026 (SQL 62). Anlass: In der Dokumentliste war nicht zu sehen,
 * ob eine Rechnung bezahlt ist oder ob die Buchung zu einer Buchungs-
 * unterlage im System steht.
 *
 * Welche Pruefung gilt, sagt der DOKUMENTTYP (document_types.pruefung):
 *   zahlung  -> bezahlt / wird eingezogen / offen / ueberfaellig
 *   buchung  -> Buchung im System erfasst / fehlt
 *   keine    -> kein Status
 *
 * EINE WAHRHEIT: Haengt an einem Dokument eine Provider-Rechnung
 * (laundry_invoices = Teuni, cleaning_invoices = Boris), gilt DEREN Status.
 * Die Zahlungsfelder am Dokument werden dann ignoriert — das Provider-Portal
 * und die Dokumentliste zeigen sonst irgendwann Verschiedenes.
 */

export type Pruefung = 'keine' | 'zahlung' | 'buchung';

export type Zustand =
  | 'bezahlt' | 'einzug' | 'offen' | 'ueberfaellig' | 'storniert'
  | 'erfasst' | 'fehlt';

export interface ProviderRechnung {
  status: string | null;
  bezahlt_am: string | null;
  faelligkeitsdatum: string | null;
}

export interface BuchungInfo {
  id: string;
  check_in: string;
  gast: string | null;
}

export interface StatusEingabe {
  pruefung: Pruefung;
  zahlart: string | null;
  faellig_am: string | null;
  bezahlt_am: string | null;
  /** Verknuepfte Teuni- oder Boris-Rechnung, falls vorhanden. */
  rechnung: ProviderRechnung | null;
  /** Gefundene Buchung (ueber booking_id, 2./3. Zuordnung oder Referenz). */
  buchung: BuchungInfo | null;
  /** Heutiges Datum als YYYY-MM-DD — von aussen, damit testbar. */
  heute: string;
}

export interface DokStatus {
  zustand: Zustand;
  /** Kurztext fuer die Liste. */
  text: string;
  /** Zaehlt fuer den Filter „Offen" — hier muss Uli etwas tun. */
  offen: boolean;
}

export const ZUSTAND_LABEL: Record<Zustand, string> = {
  bezahlt: 'bezahlt',
  einzug: 'wird eingezogen',
  offen: 'offen',
  ueberfaellig: 'überfällig',
  storniert: 'storniert',
  erfasst: 'Buchung erfasst',
  fehlt: 'Buchung fehlt',
};

/** Tailwind-Klassen je Zustand — gruen erledigt, blau automatisch, orange/rot offen. */
export const ZUSTAND_FARBE: Record<Zustand, string> = {
  bezahlt: 'bg-emerald-100 text-emerald-800',
  einzug: 'bg-sky-100 text-sky-800',
  offen: 'bg-amber-100 text-amber-800',
  ueberfaellig: 'bg-red-100 text-red-800',
  storniert: 'bg-slate-100 text-slate-600',
  erfasst: 'bg-emerald-100 text-emerald-800',
  fehlt: 'bg-red-100 text-red-800',
};

const datum = (iso: string) => {
  const [j, m, t] = iso.slice(0, 10).split('-');
  return `${t}.${m}.${j}`;
};

export function dokumentStatus(e: StatusEingabe): DokStatus | null {
  if (e.pruefung === 'buchung') {
    if (e.buchung) {
      const teile = [datum(e.buchung.check_in), e.buchung.gast].filter(Boolean);
      return { zustand: 'erfasst', text: `erfasst · ${teile.join(' · ')}`, offen: false };
    }
    return { zustand: 'fehlt', text: 'nicht im System', offen: true };
  }

  if (e.pruefung !== 'zahlung') return null;

  // Provider-Rechnung hat Vorrang (eine Wahrheit).
  if (e.rechnung) {
    const s = (e.rechnung.status ?? '').toLowerCase();
    if (s === 'storniert') return { zustand: 'storniert', text: 'storniert', offen: false };
    if (s === 'bezahlt' || s === 'paid' || e.rechnung.bezahlt_am) {
      const am = e.rechnung.bezahlt_am ? ` ${datum(e.rechnung.bezahlt_am)}` : '';
      return { zustand: 'bezahlt', text: `bezahlt${am}`, offen: false };
    }
    const faellig = e.rechnung.faelligkeitsdatum ?? e.faellig_am;
    if (faellig && faellig.slice(0, 10) < e.heute) {
      return { zustand: 'ueberfaellig', text: `überfällig seit ${datum(faellig)}`, offen: true };
    }
    return { zustand: 'offen', text: faellig ? `offen · fällig ${datum(faellig)}` : 'offen', offen: true };
  }

  if (e.bezahlt_am) return { zustand: 'bezahlt', text: `bezahlt ${datum(e.bezahlt_am)}`, offen: false };
  if (e.zahlart === 'einzug') return { zustand: 'einzug', text: 'wird eingezogen', offen: false };
  if (e.faellig_am && e.faellig_am.slice(0, 10) < e.heute) {
    return { zustand: 'ueberfaellig', text: `überfällig seit ${datum(e.faellig_am)}`, offen: true };
  }
  return { zustand: 'offen', text: e.faellig_am ? `offen · fällig ${datum(e.faellig_am)}` : 'offen', offen: true };
}

/** Heutiges Datum in Ortszeit als YYYY-MM-DD (nicht UTC — sonst kippt es nachts). */
export function heuteIso(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
