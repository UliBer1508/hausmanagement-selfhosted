// Dienstleister aktiv/inaktiv (NEU 09.11.2026, SQL 69)
//
// DOPPELGÄNGER: inhaltsgleich (ohne die UI-Texte) zu src/lib/providerStatus.ts.
// Wer hier etwas ändert, MUSS es dort mitziehen — und umgekehrt.
//
// `service_providers.inaktiv_wirkung` gilt NUR, solange is_active = false ist.

export type InaktivWirkung =
  | 'keine_reinigungen'
  | 'keine_nachrichten'
  | 'nicht_waehlbar'
  | 'portal_gesperrt';

export const STANDARD_INAKTIV_WIRKUNG: InaktivWirkung[] = [
  'keine_reinigungen',
  'keine_nachrichten',
  'nicht_waehlbar',
];

export interface ProviderStatus {
  is_active?: boolean | null;
  inaktiv_wirkung?: string[] | null;
}

/** true, wenn der Dienstleister inaktiv ist UND diese Wirkung gewählt wurde. NULL = aktiv. */
export const istGesperrt = (
  provider: ProviderStatus | null | undefined,
  wirkung: InaktivWirkung,
): boolean => {
  if (!provider || provider.is_active !== false) return false;
  return (provider.inaktiv_wirkung ?? STANDARD_INAKTIV_WIRKUNG).includes(wirkung);
};
