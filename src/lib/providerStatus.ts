// Dienstleister aktiv/inaktiv (NEU 09.11.2026, SQL 69)
//
// `service_providers.is_active` schaltet einen Dienstleister ab.
// `service_providers.inaktiv_wirkung` legt je Dienstleister fest, WAS dann gilt.
// Die Liste wirkt NUR, solange is_active = false ist.
//
// DOPPELGÄNGER: inhaltsgleich in supabase/functions/_shared/providerStatus.ts
// (Deno kann diese Datei nicht importieren). Wer hier etwas ändert, MUSS es dort
// mitziehen — und umgekehrt.

export const INAKTIV_WIRKUNGEN = [
  {
    key: 'keine_reinigungen',
    label: 'Keine neuen Reinigungen',
    hinweis: 'Die Automatik legt keine Reinigungen mehr für ihn an',
  },
  {
    key: 'keine_nachrichten',
    label: 'Keine Nachrichten',
    hinweis: 'Keine Terminfragen, Erinnerungen und Max-Nachrichten',
  },
  {
    key: 'nicht_waehlbar',
    label: 'Nicht mehr auswählbar',
    hinweis: 'Taucht beim Anlegen einer Reinigung nicht mehr auf',
  },
  {
    key: 'portal_gesperrt',
    label: 'Portal sperren',
    hinweis: 'Sein Portal zeigt nur noch „Zugang deaktiviert"',
  },
] as const;

export type InaktivWirkung = (typeof INAKTIV_WIRKUNGEN)[number]['key'];

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
