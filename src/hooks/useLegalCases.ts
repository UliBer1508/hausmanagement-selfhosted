import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { LegalCase, LegalCaseEntry } from "@/types";
import { toast } from "sonner";

// Rechtliche Verfahren je Objekt (Tab „Rechtliches").
// Tabellen legal_cases + legal_case_entries, SQL 69/70. Dokumente laufen über die
// Dokumentenverwaltung (OneDrive) mit Zuordnung 'verfahren' — useDocumentsForCase (SQL 71).
// Die Tabellen sind noch nicht in integrations/supabase/types.ts (generiert) →
// `as any` wie in useTenantPayments.ts.

const CASES_KEY = ['legal-cases'];

export const useLegalCases = (houseId?: string) => {
  return useQuery({
    queryKey: [...CASES_KEY, houseId ?? 'all'],
    queryFn: async () => {
      let query = supabase
        .from('legal_cases' as any)
        .select('*, houses(id, name, rental_type), legal_case_entries(*)')
        .order('created_at', { ascending: false });

      if (houseId) query = query.eq('house_id', houseId);

      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as any as LegalCase[];
    },
  });
};

type CaseInput = Omit<LegalCase, 'id' | 'created_at' | 'updated_at' | 'houses' | 'legal_case_entries'>;

export const useSaveLegalCase = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...values }: Partial<CaseInput> & { id?: string }) => {
      const query = id
        ? supabase.from('legal_cases' as any).update(values).eq('id', id).select()
        : supabase.from('legal_cases' as any).insert([values]).select();

      const { data, error } = await query;
      if (error) throw error;
      // Ohne Zeile zurück = nichts gespeichert (RLS, falsche ID) — nicht still als Erfolg melden
      if (!data || data.length === 0) throw new Error('Keine Zeile gespeichert');
      return data[0] as any as LegalCase;
    },
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: CASES_KEY });
      toast.success(vars.id ? 'Verfahren gespeichert' : 'Verfahren angelegt');
    },
    onError: (error: any) => {
      console.error('[useSaveLegalCase]', error);
      toast.error('Fehler beim Speichern des Verfahrens: ' + error.message);
    },
  });
};

export const useDeleteLegalCase = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      // Dokumente bleiben in der Dokumentenverwaltung (OneDrive) erhalten;
      // nur ihre Verknüpfung zum Verfahren entfällt.
      await supabase.from('document_links').delete().eq('entity_type', 'verfahren').eq('entity_id', id);

      const { data, error } = await supabase
        .from('legal_cases' as any)
        .delete()
        .eq('id', id)
        .select();
      if (error) throw error;
      if (!data || data.length === 0) throw new Error('Keine Zeile gelöscht');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: CASES_KEY });
      toast.success('Verfahren gelöscht');
    },
    onError: (error: any) => {
      console.error('[useDeleteLegalCase]', error);
      toast.error('Fehler beim Löschen: ' + error.message);
    },
  });
};

type EntryInput = Omit<LegalCaseEntry, 'id' | 'created_at' | 'updated_at'>;

export const useSaveLegalEntry = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...values }: Partial<EntryInput> & { id?: string }) => {
      const query = id
        ? supabase.from('legal_case_entries' as any).update(values).eq('id', id).select()
        : supabase.from('legal_case_entries' as any).insert([values]).select();

      const { data, error } = await query;
      if (error) throw error;
      if (!data || data.length === 0) throw new Error('Keine Zeile gespeichert');
      return data[0] as any as LegalCaseEntry;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: CASES_KEY });
    },
    onError: (error: any) => {
      console.error('[useSaveLegalEntry]', error);
      toast.error('Fehler beim Speichern des Eintrags: ' + error.message);
    },
  });
};

export const useDeleteLegalEntry = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await supabase
        .from('legal_case_entries' as any)
        .delete()
        .eq('id', id)
        .select();
      if (error) throw error;
      if (!data || data.length === 0) throw new Error('Keine Zeile gelöscht');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: CASES_KEY });
      toast.success('Eintrag gelöscht');
    },
    onError: (error: any) => {
      console.error('[useDeleteLegalEntry]', error);
      toast.error('Fehler beim Löschen: ' + error.message);
    },
  });
};

// ---------------------------------------------------------------------------
// Anzeige-Hilfen
// ---------------------------------------------------------------------------
export const CASE_TYPE_LABELS: Record<LegalCase['case_type'], string> = {
  raeumungsklage: 'Räumungsklage',
  mietrueckstand: 'Mietrückstand',
  behoerde: 'Behörde / Amt',
  gewaehrleistung: 'Gewährleistung / Handwerker',
  schaden: 'Schaden / Versicherung',
  sonstiges: 'Sonstiges',
};

export const CASE_STATUS_LABELS: Record<LegalCase['status'], string> = {
  vorbereitung: 'In Vorbereitung',
  offen: 'Offen',
  eingereicht: 'Eingereicht',
  zugestellt: 'Zugestellt',
  verhandlung: 'Verhandlung',
  urteil: 'Urteil',
  vollstreckung: 'Vollstreckung',
  ruht: 'Ruht',
  erledigt: 'Erledigt',
};

export const ENTRY_TYPE_LABELS: Record<LegalCaseEntry['entry_type'], string> = {
  ereignis: 'Ereignis',
  aufgabe: 'Aufgabe',
  frage: 'Frage an Anwalt',
  frist: 'Frist',
  kuendigung: 'Kündigung',
  schriftsatz: 'Schriftsatz / Schreiben',
  beweis: 'Beweis / Anlage',
  termin: 'Termin',
};

/** Unterarten — derzeit nur für Kündigungen */
export const KUENDIGUNG_SUBTYPES: Record<string, string> = {
  fristlos: 'Fristlos (außerordentlich)',
  hilfsweise_ordentlich: 'Hilfsweise ordentlich',
  ordentlich: 'Ordentlich',
  sonstige: 'Sonstige',
};

export const PARTY_LABELS: Record<NonNullable<LegalCaseEntry['party']>, string> = {
  wir: 'Wir',
  anwalt: 'Unser Anwalt',
  gegner: 'Gegenseite',
  gericht: 'Gericht',
  behoerde: 'Behörde',
  sonstige: 'Sonstige',
};

/** Welche Felder der Eintragsdialog je Art zeigt */
export const ENTRY_FIELDS: Record<LegalCaseEntry['entry_type'], { due: boolean; party: boolean; reference: boolean; subtype: boolean; checkable: boolean }> = {
  ereignis:    { due: false, party: false, reference: false, subtype: false, checkable: false },
  aufgabe:     { due: true,  party: false, reference: false, subtype: false, checkable: true },
  frage:       { due: false, party: false, reference: false, subtype: false, checkable: true },
  frist:       { due: true,  party: false, reference: false, subtype: false, checkable: true },
  kuendigung:  { due: false, party: true,  reference: true,  subtype: true,  checkable: false },
  schriftsatz: { due: false, party: true,  reference: true,  subtype: false, checkable: false },
  beweis:      { due: false, party: true,  reference: true,  subtype: false, checkable: false },
  termin:      { due: false, party: false, reference: false, subtype: false, checkable: true },
};

/** Verfahren gilt als laufend, solange es nicht erledigt ist. */
export const isCaseActive = (c: Pick<LegalCase, 'status'>) => c.status !== 'erledigt';

/** Schonfrist § 569 Abs. 3 Nr. 2 BGB nur bei Zahlungsverzug-Verfahren sinnvoll. */
export const hasGracePeriod = (c: Pick<LegalCase, 'case_type'>) =>
  c.case_type === 'raeumungsklage' || c.case_type === 'mietrueckstand';
