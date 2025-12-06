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
  small_towels_per_guest: { label: 'Handtücher klein', category: 'Badbereich', icon: '🧺' },
  sauna_towels_per_guest: { label: 'Saunatücher', category: 'Wellness', icon: '🧖' },
  bath_mats_per_booking: { label: 'Badvorleger', category: 'Badbereich', icon: '🛁' },
  sink_towels_per_booking: { label: 'WB-Handtücher', category: 'Badbereich', icon: '🚿' },
  kitchen_towels_per_booking: { label: 'Küchentücher', category: 'Küchenbereich', icon: '🍴' },
  table_linens_per_booking: { label: 'Tischwäsche', category: 'Küchenbereich', icon: '🍽️' }
};
