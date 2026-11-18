import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { LegalCase, LegalCaseEntry, LegalCaseFile } from "@/types";
import { toast } from "sonner";

// Rechtliche Verfahren je Objekt (Tab „Rechtliches").
// Tabellen legal_cases + legal_case_entries + legal_case_files,
// SQL: supabase/SQL/69_rechtliches_verfahren.sql und 70_rechtliches_ergaenzungen_dateien.sql.
// Die Tabellen sind noch nicht in integrations/supabase/types.ts (generiert) →
// `as any` wie in useTenantPayments.ts.

const CASES_KEY = ['legal-cases'];
const BUCKET = 'legal-files';

export const useLegalCases = (houseId?: string) => {
  return useQuery({
    queryKey: [...CASES_KEY, houseId ?? 'all'],
    queryFn: async () => {
      let query = supabase
        .from('legal_cases' as any)
        .select('*, houses(id, name, rental_type), legal_case_entries(*), legal_case_files(*)')
        .order('created_at', { ascending: false });

      if (houseId) query = query.eq('house_id', houseId);

      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as any as LegalCase[];
    },
  });
};

type CaseInput = Omit<LegalCase, 'id' | 'created_at' | 'updated_at' | 'houses' | 'legal_case_entries' | 'legal_case_files'>;

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
      // Dateien des Verfahrens im Speicher mit entfernen (Ordner = Verfahrens-ID);
      // die Zeilen in legal_case_files löscht die DB per ON DELETE CASCADE.
      const { data: stored } = await supabase.storage.from(BUCKET).list(id, { limit: 1000 });
      if (stored && stored.length > 0) {
        const { error: removeError } = await supabase.storage.from(BUCKET).remove(stored.map(f => `${id}/${f.name}`));
        if (removeError) console.error('[useDeleteLegalCase] Dateien nicht entfernt', removeError);
      }

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
// Dateien (privater Bucket 'legal-files', Anzeige über signierte URL)
// ---------------------------------------------------------------------------
export const useUploadLegalFile = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ caseId, entryId, file, description }:
      { caseId: string; entryId?: string | null; file: File; description?: string | null }) => {
      // Dateiname für den Pfad bereinigen; Originalname bleibt in file_name erhalten
      const safeName = file.name.normalize('NFKD').replace(/[^\w.-]+/g, '_');
      const path = `${caseId}/${Date.now()}-${safeName}`;

      const { error: uploadError } = await supabase.storage.from(BUCKET).upload(path, file, {
        contentType: file.type || undefined,
      });
      if (uploadError) throw uploadError;

      const { data, error } = await supabase
        .from('legal_case_files' as any)
        .insert([{
          case_id: caseId,
          entry_id: entryId ?? null,
          file_path: path,
          file_name: file.name,
          mime_type: file.type || null,
          size_bytes: file.size,
          description: description ?? null,
        }])
        .select();
      if (error || !data || data.length === 0) {
        // Datei ohne Datensatz nicht liegen lassen
        await supabase.storage.from(BUCKET).remove([path]);
        throw error ?? new Error('Datei-Eintrag nicht gespeichert');
      }
      return data[0] as any as LegalCaseFile;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: CASES_KEY });
    },
    onError: (error: any) => {
      console.error('[useUploadLegalFile]', error);
      toast.error('Fehler beim Hochladen: ' + error.message);
    },
  });
};

export const useDeleteLegalFile = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (file: LegalCaseFile) => {
      const { data, error } = await supabase
        .from('legal_case_files' as any)
        .delete()
        .eq('id', file.id)
        .select();
      if (error) throw error;
      if (!data || data.length === 0) throw new Error('Keine Zeile gelöscht');
      const { error: removeError } = await supabase.storage.from(BUCKET).remove([file.file_path]);
      if (removeError) console.error('[useDeleteLegalFile] Datei im Speicher nicht entfernt', removeError);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: CASES_KEY });
      toast.success('Datei gelöscht');
    },
    onError: (error: any) => {
      console.error('[useDeleteLegalFile]', error);
      toast.error('Fehler beim Löschen: ' + error.message);
    },
  });
};

/** Öffnet eine Datei in neuem Tab (signierte URL, 10 Minuten gültig). */
export const openLegalFile = async (file: LegalCaseFile) => {
  // Fenster sofort öffnen — sonst blockiert der Popup-Blocker nach dem await
  const win = window.open('', '_blank');
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(file.file_path, 600);
  if (error || !data?.signedUrl) {
    win?.close();
    console.error('[openLegalFile]', error);
    toast.error('Datei konnte nicht geöffnet werden');
    return;
  }
  if (win) win.location.href = data.signedUrl;
  else window.location.href = data.signedUrl;
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
