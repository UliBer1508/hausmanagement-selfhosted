/**
 * Gemeinsamer Schlüssel zur Gast-Identifikation über mehrere Buchungen hinweg.
 *
 * WARUM ES DIESE DATEI GIBT (Bug vom 11.08.2026, "Bernd Wagner zeigt Neuer
 * Gast trotz 2. Buchung"): Mehrere Stellen im Code haben bisher Buchungen
 * per `guest_email`-String gruppiert, um Stammgäste zu erkennen. Das bricht,
 * sobald `guest_email` bei EINER Buchung leer ist (z. B. weil sie manuell
 * angelegt wurde) — obwohl `guest_id` auf beiden Buchungen korrekt und
 * identisch gesetzt ist.
 *
 * `guest_id` wird beim Anlegen/Bearbeiten einer Buchung über eine
 * Matching-Kaskade gesetzt (siehe `CreateBookingForm.tsx`,
 * `handleSubmit`/Gast-Zuordnung: E-Mail → Telefon → Name+Nationalität →
 * exakter Name) und ist damit deutlich zuverlässiger als der reine
 * `guest_email`-Text auf der einzelnen Buchungszeile.
 *
 * Regel: **Immer `guest_id` zuerst verwenden.** `guest_email`/`guest_name`
 * sind nur ein Fallback für Alt-Buchungen ohne `guest_id`.
 */

export interface GuestKeyInput {
  guest_id?: string | null;
  guest_email?: string | null;
  guest_name?: string | null;
}

/**
 * Liefert einen stabilen String-Schlüssel für einen Gast oder `null`, wenn
 * nicht einmal ein Name vorhanden ist (sollte praktisch nicht vorkommen).
 *
 * Die Präfixe (`id:`, `email:`, `name:`) verhindern, dass eine `guest_id`
 * zufällig mit einem gleich lautenden Namen/E-Mail-Fallback kollidiert.
 */
export const getGuestKey = (booking: GuestKeyInput): string | null => {
  if (booking.guest_id) return `id:${booking.guest_id}`;

  const email = (booking.guest_email || '').trim().toLowerCase();
  if (email) return `email:${email}`;

  const name = (booking.guest_name || '').trim().toLowerCase();
  return name ? `name:${name}` : null;
};
