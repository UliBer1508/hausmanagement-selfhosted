// Wäschefarben-Typen (für gesamte Bestellung)
export type LinenColor = 'grey_striped' | 'white_striped' | 'white' | 'colorful';

export const LINEN_COLORS: { key: LinenColor; label: string; icon: string }[] = [
  { key: 'grey_striped', label: 'Grau gestreift', icon: '🔲' },
  { key: 'white_striped', label: 'Weiß gestreift', icon: '⬜' },
  { key: 'white', label: 'Weiß', icon: '⬜' },
  { key: 'colorful', label: 'Bunt', icon: '🌈' }
];

// Artikel-Farben (für einzelne Items wie Handtücher)
export type ItemColor = 'white' | 'grey';

export const ITEM_COLORS: { key: ItemColor; label: string; icon: string }[] = [
  { key: 'white', label: 'Weiß', icon: '⬜' },
  { key: 'grey', label: 'Grau', icon: '🔲' }
];

export const getItemColorLabel = (color: ItemColor | string | undefined): string => {
  const found = ITEM_COLORS.find(c => c.key === color);
  return found ? `${found.icon} ${found.label}` : '⬜ Weiß';
};

export const getLinenColorLabel = (color: LinenColor | string): string => {
  const found = LINEN_COLORS.find(c => c.key === color);
  return found ? `${found.icon} ${found.label}` : color;
};

export const getLinenColorIcon = (color: LinenColor | string): string => {
  return LINEN_COLORS.find(c => c.key === color)?.icon || '⬜';
};

export interface LinenItemConfig {
  key: string;
  label: string;
  icon?: string;
  category: 'Schlafbereich' | 'Badbereich' | 'Wellness' | 'Küchenbereich';
  quantity: number;
  calculation_type: 'per_guest' | 'per_booking';
  availability: 'year_round' | 'seasonal';
  season?: 'winter' | 'summer' | null;
  active: boolean;
  color?: ItemColor | LinenColor; // Artikelfarbe (ItemColor für Badbereich/Wellness, LinenColor für Schlafbereich)
  external_artikelnummer?: Record<string, string>; // Teuni-Artikelnummer unter 'default'; Altbestand: farbbasiert { "grey_striped": "WA001" }
  /*
   * Diese Zeile bestimmt die berechnete Menge ihres Artikels (05.09.2026).
   *
   * Hintergrund: „Mietwäsche Paket 5 Tlg" (MW4) ist EIN Artikel, der mehrere
   * Set-Positionen abdeckt — bei Wald Bettwäsche, Kissenbezüge und
   * Spannbetttücher. Alle drei tragen denselben Artikel und denselben Preis.
   * Wer je Set-Zeile rechnet, zählt das Paket dreifach.
   *
   * Regel: Tragen mehrere Zeilen denselben Artikel, ist GENAU EINE mit
   * preis_zaehlt = true die abrechnungsrelevante; die übrigen stehen auf
   * false und gehen mit 0 in die Kostenrechnung ein — nicht als „Preis
   * fehlt", denn sie sind im Paket enthalten.
   *
   * Trägt ein Artikel nur EINE Zeile, ist das Feld gegenstandslos und bleibt
   * undefined. Wer es liest, behandelt undefined wie true.
   */
  preis_zaehlt?: boolean;
}

export interface LinenSetDefinition {
  id?: string;
  house_id: string;
  custom_categories: Record<string, LinenItemConfig>;
  // Old columns for backward compatibility
  bedding_per_guest?: number;
  large_towels_per_guest?: number;
  small_towels_per_guest?: number;
  sauna_towels_per_guest?: number;
  blankets_per_guest?: number;
  pillow_cases_per_guest?: number;
  bath_mats_per_booking?: number;
  sink_towels_per_booking?: number;
  kitchen_towels_per_booking?: number;
  table_linens_per_booking?: number;
  created_at?: string;
  updated_at?: string;
}

export const LINEN_CATEGORIES = [
  'Schlafbereich',
  'Badbereich',
  'Wellness',
  'Küchenbereich'
] as const;

export const OLD_COLUMN_MAPPING: Record<string, { label: string; category: LinenItemConfig['category']; icon: string }> = {
  bedding_per_guest: { label: 'Bettwäsche', category: 'Schlafbereich', icon: '🛏️' },
  blankets_per_guest: { label: 'Decken', category: 'Schlafbereich', icon: '🛌' },
  pillow_cases_per_guest: { label: 'Kissenbezüge', category: 'Schlafbereich', icon: '🛏️' },
  large_towels_per_guest: { label: 'Badetücher', category: 'Badbereich', icon: '🧺' },
  small_towels_per_guest: { label: 'Handtücher', category: 'Badbereich', icon: '🧺' },
  sauna_towels_per_guest: { label: 'Saunatücher', category: 'Wellness', icon: '🧖' },
  bath_mats_per_booking: { label: 'Badvorleger', category: 'Badbereich', icon: '🛁' },
  sink_towels_per_booking: { label: 'WB-Handtücher', category: 'Badbereich', icon: '🚿' },
  kitchen_towels_per_booking: { label: 'Geschirrtücher', category: 'Küchenbereich', icon: '🍴' },
  table_linens_per_booking: { label: 'Tischwäsche', category: 'Küchenbereich', icon: '🍽️' }
};
