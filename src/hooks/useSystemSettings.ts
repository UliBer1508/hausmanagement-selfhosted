import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Json } from '@/integrations/supabase/types';
import type { PlatformMarkupSettings } from '@/lib/platformMarkup';

export interface EmailSettings {
  email: string;
  display_name: string;
}

export interface ProfileSettings {
  user_name: string;
  company_name: string;
}

export interface AppearanceSettings {
  theme: 'light' | 'dark';
  language: string;
  compact_view: boolean;
}

export interface RatingReminderSettings {
  is_enabled: boolean;
  min_days_after_checkout: number;
  max_days_after_checkout: number;
  require_platform: boolean;
  rental_type_filter: 'tourist' | 'tenant' | 'all';
}

export interface ContactSettings {
  contact_email: string;
  contact_phone: string;
  signature_name: string;
  signature_role: string;
}

export interface MorningSummarySettings {
  enabled: boolean;              // proaktive Zustellung an/aus (Not-Aus)
  time: string;                  // Uhrzeit des Cron-Laufs, z.B. "06:30"
  channel: 'email' | 'chat' | 'both';
  email_to: string;              // Empfänger der Morgen-Übersicht
  upcoming_days?: number;        // „Kommende Buchungen": so viele Tage voraus (Standard 7)
  include?: Record<string, boolean>; // Abschnitte ein/aus (z. B. belegung) — nur per SQL gepflegt
}

// Naechtliche Datensicherung (SQL 60). Wird vom Skript Backup-Supabase.ps1 auf dem
// PN40 zu Beginn jedes Laufs gelesen; warn_after_hours nutzt nur die Anzeige.
export interface BackupSettings {
  enabled: boolean;            // false = Lauf wird als "pausiert" protokolliert, nichts gesichert
  retention_days: number;      // Sicherungen aelter als X Tage loescht das Skript
  include_storage: boolean;    // Dateien (Hausbilder, Mietbelege) mitsichern
  warn_after_hours: number;    // Karte warnt, wenn die letzte gelungene Sicherung aelter ist
}

type SettingsValue = EmailSettings | ProfileSettings | AppearanceSettings | RatingReminderSettings | ContactSettings | MorningSummarySettings | PlatformMarkupSettings | BackupSettings | Record<string, unknown>;

export function useSystemSettings<T extends SettingsValue>(key: string) {
  const queryClient = useQueryClient();

  const { data, isLoading, error } = useQuery({
    queryKey: ['system-settings', key],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('system_settings')
        .select('value')
        .eq('key', key)
        .maybeSingle();
      
      if (error) throw error;
      // Fix (13.09.2026): `data` ist null, wenn die Zeile fehlt — und
      // `null?.value` ergibt UNDEFINED, nicht null. React Query v5 verbietet
      // undefined als Ergebnis und wirft "data is undefined". Das traf bisher
      // nicht auf, weil für alle bestehenden Schlüssel eine Zeile existiert;
      // beim ersten neuen Schlüssel (platform_markups) schlug es sofort zu.
      // `?? null` macht den dokumentierten Rückgabetyp `T | null` wahr.
      return ((data?.value as T) ?? null);
    },
  });

  const mutation = useMutation({
    mutationFn: async (value: T) => {
      // First check if the setting exists
      const { data: existing } = await supabase
        .from('system_settings')
        .select('id')
        .eq('key', key)
        .maybeSingle();
      
      const jsonValue = value as unknown as Json;
      
      if (existing) {
        // Update existing
        const { error } = await supabase
          .from('system_settings')
          .update({ 
            value: jsonValue,
            updated_at: new Date().toISOString()
          })
          .eq('key', key);
        if (error) throw error;
      } else {
        // Insert new
        const { error } = await supabase
          .from('system_settings')
          .insert([{ 
            key, 
            value: jsonValue
          }]);
        if (error) throw error;
      }
      
      return value;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['system-settings', key] });
    },
  });

  return {
    data,
    isLoading,
    error,
    saveSettings: mutation.mutateAsync,
    isSaving: mutation.isPending,
  };
}

// Convenience hooks for specific settings
export function useEmailSettings() {
  return useSystemSettings<EmailSettings>('email_settings');
}

export function useProfileSettings() {
  return useSystemSettings<ProfileSettings>('profile_settings');
}

export function useAppearanceSettings() {
  return useSystemSettings<AppearanceSettings>('appearance_settings');
}

export function useRatingReminderSettings() {
  return useSystemSettings<RatingReminderSettings>('rating_reminder_settings');
}

export function useContactSettings() {
  return useSystemSettings<ContactSettings>('contact_settings');
}

export function useMorningSummarySettings() {
  return useSystemSettings<MorningSummarySettings>('morning_summary_settings');
}

export const DEFAULT_MORNING_SUMMARY_SETTINGS: MorningSummarySettings = {
  enabled: false,          // Sicherheitsgurt: standardmäßig AUS
  time: '06:30',
  channel: 'email',
  email_to: '',
  upcoming_days: 7,
};

export const DEFAULT_RATING_REMINDER_SETTINGS: RatingReminderSettings = {
  is_enabled: true,
  min_days_after_checkout: 14,
  max_days_after_checkout: 90,
  require_platform: true,
  rental_type_filter: 'tourist',
};

// Plattform-Aufschlag-Sätze (Netto-Auszahlung -> Verkaufspreis).
// Logik und Startwerte in src/lib/platformMarkup.ts (einzige Quelle der Wahrheit).
export function usePlatformMarkups() {
  return useSystemSettings<PlatformMarkupSettings>('platform_markups');
}

// Naechtliche Datensicherung (Karte Einstellungen -> Datensicherung)
export function useBackupSettings() {
  return useSystemSettings<BackupSettings>('backup_settings');
}

export const DEFAULT_BACKUP_SETTINGS: BackupSettings = {
  enabled: true,
  retention_days: 30,
  include_storage: true,
  warn_after_hours: 30,
};
