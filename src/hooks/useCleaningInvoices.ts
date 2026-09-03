import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

/**
 * useCleaningInvoices — Rechnungen von Reinigungsdienstleistern.
 *
 * Gegenstueck zu useLaundryInvoices fuer Waesche. Getrennte Tabellen,
 * bewusst: siehe supabase/SQL/53_reinigungsrechnungen.sql, Abschnitt
 * "ENTSCHEIDUNG".
 *
 * Amela stellt keine Rechnungen — ihre Abrechnung laeuft weiter ueber den
 * ProviderBillingDialog. Diese Hooks betreffen Boris und kuenftige
 * Reinigungsdienstleister, die Rechnungen schicken.
 */

export interface CleaningInvoicePosition {
  pos: number;
  beschreibung: string;
  datum: string;
  betrag: number;
  /** Zugeordnete Reinigung, falls beim Einlesen gefunden. */
  task_id: string | null;
  haus_name: string | null;
}

export interface CleaningInvoice {
  id: string;
  provider_id: string;
  rechnungsnummer: string;
  rechnungsdatum: string;
  faelligkeitsdatum: string | null;
  nettobetrag: number | null;
  mwst_satz: number | null;
  mwst_betrag: number | null;
  bruttobetrag: number;
  positionen: CleaningInvoicePosition[] | null;
  status: string;
  bezahlt_am: string | null;
  notes: string | null;
  created_at: string;
}

/** Alle Rechnungen, neueste zuerst. Optional auf einen Dienstleister begrenzt. */
export const useCleaningInvoices = (providerId?: string) =>
  useQuery({
    queryKey: ['cleaning-invoices', providerId ?? 'alle'],
    queryFn: async () => {
      let q = supabase
        .from('cleaning_invoices')
        .select('*')
        .order('rechnungsdatum', { ascending: false });
      if (providerId) q = q.eq('provider_id', providerId);

      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as unknown as CleaningInvoice[];
    },
  });

/**
 * Legt eine Rechnung an und verknuepft die erkannten Reinigungen.
 *
 * REIHENFOLGE: erst die Rechnung, dann die Reinigungen. Scheitert das
 * Verknuepfen, existiert die Rechnung bereits und der Vorgang kann
 * wiederholt werden — der harmlosere Fall. Umgekehrt haetten wir
 * Reinigungen, die auf eine Rechnung zeigen, die es nicht gibt.
 *
 * `payment_status` wird NICHT angefasst. Eine Rechnung zu erhalten heisst
 * nicht, sie bezahlt zu haben; Boris' Rechnung nennt ausdruecklich eine
 * Frist von sieben Tagen. Auf 'paid' gehen die Reinigungen erst, wenn Uli
 * die RECHNUNG auf bezahlt setzt — das erledigt der DB-Trigger
 * trg_cleanings_paid_on_invoice_paid aus 53_reinigungsrechnungen.sql.
 */
export const useCreateCleaningInvoice = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (eingabe: {
      providerId: string;
      rechnungsnummer: string;
      rechnungsdatum: string;
      faelligkeitsdatum?: string | null;
      nettobetrag: number | null;
      mwstSatz: number | null;
      mwstBetrag: number | null;
      bruttobetrag: number;
      positionen: CleaningInvoicePosition[];
      notes?: string | null;
    }) => {
      const { data, error } = await supabase
        .from('cleaning_invoices')
        .insert({
          provider_id: eingabe.providerId,
          rechnungsnummer: eingabe.rechnungsnummer,
          rechnungsdatum: eingabe.rechnungsdatum,
          faelligkeitsdatum: eingabe.faelligkeitsdatum ?? null,
          nettobetrag: eingabe.nettobetrag,
          mwst_satz: eingabe.mwstSatz,
          mwst_betrag: eingabe.mwstBetrag,
          bruttobetrag: eingabe.bruttobetrag,
          positionen: eingabe.positionen as any,
          status: 'offen',
          notes: eingabe.notes ?? null,
        } as any)
        .select('id')
        .single();

      if (error) {
        // Der UNIQUE-Index greift je Dienstleister. Die Meldung soll
        // sagen, was los ist, statt den Postgres-Code zu zeigen.
        if ((error as any).code === '23505') {
          throw new Error(
            `Rechnung ${eingabe.rechnungsnummer} ist fuer diesen Dienstleister bereits erfasst.`,
          );
        }
        throw error;
      }
      if (!data?.id) {
        throw new Error('Die Rechnung konnte nicht angelegt werden (keine Kennung zurueckgemeldet).');
      }

      // Reinigungen verknuepfen. Nur die, denen beim Einlesen eindeutig
      // eine Reinigung zugeordnet wurde.
      const taskIds = eingabe.positionen
        .map((p) => p.task_id)
        .filter((id): id is string => !!id);

      let verknuepft = 0;
      if (taskIds.length > 0) {
        // `.select('id')` ist Pflicht: ohne die Zeilenpruefung meldet
        // Supabase auch dann Erfolg, wenn NULL Zeilen betroffen waren
        // (RLS blockiert, Kennung existiert nicht). Lesson 9.2.
        const { data: zug, error: zErr } = await supabase
          .from('service_tasks')
          .update({ cleaning_invoice_id: data.id } as any)
          .in('id', taskIds)
          .select('id');
        if (zErr) throw zErr;
        verknuepft = zug?.length ?? 0;

        if (verknuepft === 0) {
          throw new Error(
            'Rechnung angelegt, aber keine Reinigung wurde verknuepft.',
          );
        }
      }

      return { id: data.id as string, verknuepft, erkannt: taskIds.length };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cleaning-invoices'] });
      queryClient.invalidateQueries({ queryKey: ['service-tasks'] });
    },
    onError: (error: any) => {
      console.error('[useCreateCleaningInvoice]', error);
      toast.error(`Rechnung nicht angelegt: ${error.message}`);
    },
  });
};

/**
 * Setzt den Status einer Rechnung.
 *
 * Auf 'bezahlt' zu setzen zieht per DB-Trigger alle verknuepften
 * Reinigungen auf payment_status = 'paid'. Das Zuruecknehmen tut das
 * NICHT rueckgaengig — bewusst, siehe Kommentar im SQL.
 */
export const useUpdateCleaningInvoiceStatus = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, status }: { id: string; status: 'offen' | 'bezahlt' | 'storniert' }) => {
      const { data, error } = await supabase
        .from('cleaning_invoices')
        .update({
          status,
          bezahlt_am: status === 'bezahlt' ? new Date().toISOString().slice(0, 10) : null,
        } as any)
        .eq('id', id)
        .select('id');

      if (error) throw error;
      if (!data || data.length === 0) {
        throw new Error('Status wurde nicht gespeichert (keine Zeile betroffen).');
      }
      return data[0];
    },
    onSuccess: (_d, v) => {
      queryClient.invalidateQueries({ queryKey: ['cleaning-invoices'] });
      queryClient.invalidateQueries({ queryKey: ['service-tasks'] });
      toast.success(
        v.status === 'bezahlt'
          ? 'Rechnung als bezahlt vermerkt — die verknüpften Reinigungen ebenfalls.'
          : 'Status geändert.',
      );
    },
    onError: (error: any) => {
      console.error('[useUpdateCleaningInvoiceStatus]', error);
      toast.error(`Status nicht geändert: ${error.message}`);
    },
  });
};
