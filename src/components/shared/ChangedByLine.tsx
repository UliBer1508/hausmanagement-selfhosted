import { format, parseISO } from 'date-fns';
import { de } from 'date-fns/locale';

/**
 * Einheitliche "Geändert von: {Name} · {Datum}"-Zeile für alle Karten
 * (Buchung, Reinigung, Wäsche).
 *
 * - Gleiche Schrift und Größe überall: text-[11px] text-muted-foreground.
 * - `at` = echter Zeitpunkt der letzten Änderung. Wir nutzen bewusst
 *   `updated_at` (wird bei jeder Speicherung aktualisiert) und fallen nur
 *   ersatzweise auf `status_changed_at` zurück. Dadurch zeigt die Zeile
 *   immer den zuletzt geänderten Zeitpunkt – nicht mehr ein altes
 *   Status-Datum (Bug "01.01.26").
 * - `by` = wer zuletzt geändert hat; fehlt der Name, zeigen wir "Admin".
 */
interface ChangedByLineProps {
  by?: string | null;
  at?: string | null;
  className?: string;
}

const safeParse = (value: string): Date | null => {
  try {
    const d = value.includes('T') ? parseISO(value) : new Date(value);
    return isNaN(d.getTime()) ? null : d;
  } catch {
    return null;
  }
};

const ChangedByLine = ({ by, at, className = '' }: ChangedByLineProps) => {
  const parsed = at ? safeParse(at) : null;
  if (!parsed && !by) return null;

  const name = by || 'Admin';

  return (
    <div className={`text-[11px] leading-tight text-muted-foreground ${className}`}>
      Geändert von: {name}
      {parsed && <span> · {format(parsed, 'dd.MM.yy HH:mm', { locale: de })}</span>}
    </div>
  );
};

export default ChangedByLine;
