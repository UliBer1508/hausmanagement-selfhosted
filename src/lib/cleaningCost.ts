/**
 * cleaningCost.ts — DIE EINZIGE Definition der Reinigungskosten-Berechnung.
 *
 * Vor dem 19.08.2026 stand die Formel dreimal woertlich im Code
 * (CreateCleaningTaskDialog, EditCleaningTaskDialog, Edge Function
 * create-cleaning-task-for-booking) und lautete ueberall
 * "hourly_rate * cleaning_hours". Eine Pauschale war nicht vorgesehen,
 * Umsatzsteuer gar nicht.
 *
 * VERBINDLICH:
 *   service_tasks.cleaning_cost           = NETTO
 *   service_tasks.cleaning_vat_percentage = Satz, eingefroren zum Zeitpunkt
 *                                           der Berechnung
 *   Brutto wird IMMER abgeleitet, NIE gespeichert.
 *
 * KEIN ERSATZWERT. Fehlt der zur Abrechnungsart passende Satz, liefert diese
 * Funktion `error` und KEINEN Betrag. Der frueher in der Edge Function
 * verbaute stille Rueckfall auf 50 EUR/Std ist ersatzlos entfallen: er hat
 * Betraege erfunden, die niemand nachvollziehen konnte.
 *
 * ACHTUNG Doppelgaenger: Die Edge Function `create-cleaning-task-for-booking`
 * laeuft unter Deno und kann diese Datei nicht importieren. Sie fuehrt eine
 * bewusst identische Kopie dieser Logik. Wer hier etwas aendert, MUSS die
 * Edge Function mitziehen.
 */

export type BillingMode = 'hourly' | 'flat';

/** Nur die Felder, die fuer die Berechnung gebraucht werden. */
export interface CleaningCostProvider {
  name?: string | null;
  billing_mode?: string | null;
  hourly_rate?: number | null;
  flat_rate?: number | null;
  vat_percentage?: number | null;
}

export interface CleaningCostResult {
  /** Abrechnungsart, auf die tatsaechlich gerechnet wurde. */
  mode: BillingMode;
  /** Nettobetrag oder null, wenn nicht berechenbar. */
  net: number | null;
  /** Steuersatz in Prozent oder null, wenn keiner hinterlegt ist. */
  vatPercentage: number | null;
  /** Steuerbetrag oder null. */
  vatAmount: number | null;
  /** Bruttobetrag oder null. Nur zur Anzeige — nie speichern. */
  gross: number | null;
  /** Klartext-Meldung, wenn nicht gerechnet werden konnte. Sonst null. */
  error: string | null;
}

const round2 = (value: number): number => Math.round(value * 100) / 100;

/** Liest die Abrechnungsart robust; alles ausser 'flat' gilt als 'hourly'. */
export const getBillingMode = (provider: CleaningCostProvider | null | undefined): BillingMode =>
  provider?.billing_mode === 'flat' ? 'flat' : 'hourly';

/**
 * Berechnet die Reinigungskosten eines Auftrags.
 *
 * @param provider       Dienstleister mit billing_mode und passendem Satz
 * @param cleaningHours  Reinigungsstunden. Bei 'flat' ohne Wirkung auf den
 *                       Betrag — bleibt reine Planungsgroesse.
 */
export function calculateCleaningCost(
  provider: CleaningCostProvider | null | undefined,
  cleaningHours: number | null | undefined
): CleaningCostResult {
  const mode = getBillingMode(provider);
  const empty: CleaningCostResult = {
    mode,
    net: null,
    vatPercentage: null,
    vatAmount: null,
    gross: null,
    error: null,
  };

  if (!provider) {
    return { ...empty, error: 'Kein Dienstleister ausgewählt — Kosten können nicht berechnet werden.' };
  }

  const providerName = provider.name ? `„${provider.name}"` : 'Der Dienstleister';

  let net: number;

  if (mode === 'flat') {
    const flat = provider.flat_rate;
    if (flat == null || !(flat > 0)) {
      return {
        ...empty,
        error: `${providerName} rechnet pauschal ab, hat aber keine Pauschale hinterlegt. Bitte in der Provider-Verwaltung eintragen.`,
      };
    }
    net = round2(flat);
  } else {
    const rate = provider.hourly_rate;
    if (rate == null || !(rate > 0)) {
      return {
        ...empty,
        error: `${providerName} rechnet nach Stunden ab, hat aber keinen Stundensatz hinterlegt. Bitte in der Provider-Verwaltung eintragen.`,
      };
    }
    if (cleaningHours == null || !(cleaningHours > 0)) {
      return { ...empty, error: 'Bitte Reinigungsstunden angeben — sie bestimmen die Kosten.' };
    }
    net = round2(rate * cleaningHours);
  }

  const vatPercentage = provider.vat_percentage ?? null;
  const vatAmount = vatPercentage == null ? null : round2((net * vatPercentage) / 100);
  const gross = vatAmount == null ? null : round2(net + vatAmount);

  return { mode, net, vatPercentage, vatAmount, gross, error: null };
}

/** Brutto aus gespeicherten Task-Werten ableiten (nie gespeichert). */
export function grossFromTask(
  net: number | null | undefined,
  vatPercentage: number | null | undefined
): number | null {
  if (net == null) return null;
  if (vatPercentage == null) return round2(net);
  return round2(net + (net * vatPercentage) / 100);
}

/** Einheitliche Betragsanzeige, z. B. "150,00 EUR". */
export const formatEur = (value: number | null | undefined): string =>
  value == null ? '—' : `${value.toFixed(2).replace('.', ',')} EUR`;
