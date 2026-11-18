import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { onedrive, putInChunks } from '@/hooks/useDocuments';
import type {
  ContractTemplateContent, ContractValues, HouseContractData, InventoryItem, ProtocolRow, BiText, FilledContract,
} from '@/lib/rentalContract';

/**
 * Mietvertrag „Wohnen auf Zeit“ (Paket D, SQL 74). Tabellen noch nicht in types.ts → `as any`.
 *   rental_contract_templates   Vertragstext (Standard: house_id leer; optional je Haus)
 *   rental_contract_house_data  Vermieter, Konto, Objekt, Gemeinde, Energieausweis, Protokoll-Zeilen
 *   rental_contracts            ein Vertrag je Angebot (draft → issued → signed; cancelled)
 * PDFs: onedrive-api (wie Dokumentenverwaltung) → OneDrive, Ordner des Angebots (gleiche Regel
 * wie rental-portal), Dokumenttyp „Mieterunterlagen“, document_links 'mietangebot'.
 */

export type ContractStatus = 'draft' | 'issued' | 'signed' | 'cancelled';

export interface RentalContract {
  id: string;
  offer_id: string;
  house_id: string;
  template_id: string | null;
  status: ContractStatus;
  values: ContractValues;
  /** Kopie des fertigen Vertragstexts bei Ausfertigung (Kopf, Abschnitte, Beträge) */
  sections: FilledContract | null;
  protocol: { meters: ProtocolRow[]; keys: ProtocolRow[]; rooms: ProtocolRow[]; items: BiText[] } | null;
  inventory: InventoryItem[] | null;
  contract_document_id: string | null;
  protocol_document_id: string | null;
  signed_document_id: string | null;
  issued_at: string | null;
  signed_at: string | null;
  created_at: string;
  updated_at: string;
}

export const CONTRACT_STATUS_LABEL: Record<ContractStatus, string> = {
  draft: 'Entwurf',
  issued: 'ausgefertigt (PDF erstellt)',
  signed: 'unterschrieben',
  cancelled: 'storniert',
};

export interface ContractTemplateRow { id: string; house_id: string | null; name: string; content: ContractTemplateContent }

/** Vorlage für ein Haus: eigene, sonst Standard. */
export const useContractTemplate = (houseId: string | null) =>
  useQuery({
    queryKey: ['rental-contract-template', houseId],
    enabled: !!houseId,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('rental_contract_templates').select('id, house_id, name, content')
        .eq('is_active', true).or(`house_id.is.null,house_id.eq.${houseId}`);
      if (error) throw error;
      const liste = (data || []) as ContractTemplateRow[];
      return liste.find(t => t.house_id === houseId) ?? liste.find(t => !t.house_id) ?? null;
    },
  });

export const useHouseContractData = (houseId: string | null) =>
  useQuery({
    queryKey: ['rental-contract-house-data', houseId],
    enabled: !!houseId,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('rental_contract_house_data').select('*').eq('house_id', houseId).maybeSingle();
      if (error) throw error;
      return (data ?? null) as HouseContractData | null;
    },
  });

export const useSaveHouseContractData = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (row: HouseContractData) => {
      const { data, error } = await (supabase as any)
        .from('rental_contract_house_data').upsert(row, { onConflict: 'house_id' }).select('house_id');
      if (error) throw error;
      if (!data || data.length === 0) throw new Error('Nicht gespeichert (Rechte?)');
    },
    onSuccess: (_d, row) => queryClient.invalidateQueries({ queryKey: ['rental-contract-house-data', row.house_id] }),
  });
};

/** Inventar des Hauses für Anhang 2 — ohne Mustereinträge (is_template). */
export const useHouseInventoryForContract = (houseId: string | null) =>
  useQuery({
    queryKey: ['rental-contract-inventory', houseId],
    enabled: !!houseId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('house_inventory').select('name, quantity, condition, location, category')
        .eq('house_id', houseId!).eq('is_template', false);
      if (error) throw error;
      return (data || []) as InventoryItem[];
    },
  });

/** Aktueller (nicht stornierter) Vertrag zu einem Angebot. */
export const useRentalContract = (offerId: string | null) =>
  useQuery({
    queryKey: ['rental-contract', offerId],
    enabled: !!offerId,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('rental_contracts').select('*').eq('offer_id', offerId).neq('status', 'cancelled')
        .order('created_at', { ascending: false }).limit(1);
      if (error) throw error;
      return ((data || [])[0] ?? null) as RentalContract | null;
    },
  });

export const useSaveRentalContract = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, row }: { id?: string | null; row: Partial<RentalContract> }) => {
      const q = id
        ? (supabase as any).from('rental_contracts').update(row).eq('id', id).select('*')
        : (supabase as any).from('rental_contracts').insert(row).select('*');
      const { data, error } = await q;
      if (error) throw error;
      if (!data || data.length === 0) throw new Error('Nicht gespeichert (Rechte?)');
      return data[0] as RentalContract;
    },
    onSuccess: (c) => {
      queryClient.invalidateQueries({ queryKey: ['rental-contract', c.offer_id] });
      queryClient.invalidateQueries({ queryKey: ['rental-application', c.offer_id] });
    },
  });
};

export type ContractFileKind = 'contract' | 'protocol' | 'signed';
const ART_TEXT: Record<ContractFileKind, string> = {
  contract: 'Mietvertrag', protocol: 'Übergabeprotokoll', signed: 'Mietvertrag unterschrieben',
};

/** Wie rental-portal: Pfadtrenner und in OneDrive verbotene Zeichen entfernen. */
const sauber = (s: string) => s.replace(/[\\/:*?"<>|#%]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80);

export interface OfferForUpload { id: string; house_id: string; guest_name: string; created_at: string }

/**
 * OneDrive-Ordner der Unterlagen dieses Angebots — GLEICHE Regel wie in der Edge Function
 * rental-portal (unterlagenOrdner): <Ablageort Haus/Mieterunterlagen> / <Name (Datum Angebot)>;
 * ohne Ablageort DokumentManagement / <Hausordner> / Mieterunterlagen (wird dann gemerkt).
 * Wer die Regel ändert, ändert sie an beiden Stellen.
 */
async function unterlagenOrdner(o: OfferForUpload, houseName: string) {
  const { data: typ, error: e0 } = await supabase.from('document_types').select('id').ilike('name', 'mieterunterlagen').maybeSingle();
  if (e0) throw e0;
  if (!typ) throw new Error('Dokumenttyp „Mieterunterlagen“ fehlt (SQL 73).');
  const { data: orte, error: e1 } = await supabase.from('document_locations')
    .select('document_type_id, onedrive_path').eq('entity_type', 'haus').eq('entity_id', o.house_id);
  if (e1) throw e1;
  let basis = (orte ?? []).find(x => x.document_type_id === typ.id)?.onedrive_path ?? null;
  if (!basis) {
    const treffer = (orte ?? []).map(x => String(x.onedrive_path ?? '').split('/').map(t => t.trim()))
      .find(t => t[0]?.toLowerCase() === 'dokumentmanagement' && t[1]);
    basis = `DokumentManagement / ${treffer ? treffer[1] : sauber(houseName || 'Haus')} / Mieterunterlagen`;
    const { id: basisId } = await onedrive<{ id: string }>('resolvePath', { path: basis });
    const { error: e2 } = await supabase.from('document_locations').upsert(
      { entity_type: 'haus', entity_id: o.house_id, document_type_id: typ.id, onedrive_item_id: basisId, onedrive_path: basis } as any,
      { onConflict: 'entity_type,entity_id,document_type_id' },
    );
    if (e2) console.error('[Mietvertrag] Ablageort merken', e2);
  }
  const path = `${basis} / ${sauber(`${o.guest_name} (${String(o.created_at).slice(0, 10)})`)}`;
  const { id } = await onedrive<{ id: string }>('resolvePath', { path });
  return { folderId: id, path, typeId: typ.id as string };
}

/**
 * Legt eine Datei im OneDrive-Ordner des Angebots ab (neben den Unterlagen des Kunden) und
 * verknüpft sie mit dem Angebot (document_links 'mietangebot'). Läuft über onedrive-api
 * (Admin-Anmeldung) wie der Upload in der Dokumentenverwaltung. Gibt documents.id zurück.
 */
export async function uploadContractFile(o: OfferForUpload, houseName: string, file: Blob, fileName: string, kind: ContractFileKind) {
  const ordner = await unterlagenOrdner(o, houseName);
  const name = sauber(fileName.replace(/\.[^.]+$/, '')) + (fileName.match(/\.[^.]+$/)?.[0] ?? '.pdf');
  const { uploadUrl } = await onedrive<{ uploadUrl: string }>('uploadSession', { folderId: ordner.folderId, fileName: name });
  const datei = file instanceof File ? file : new File([file], name, { type: file.type || 'application/pdf' });
  const itemId = await putInChunks(uploadUrl, datei);
  const info = await onedrive<{ id: string; name: string; size: number; webUrl: string; mimeType: string | null; driveId: string | null }>('itemInfo', { itemId });
  const { data, error } = await supabase.from('documents').insert([{
    file_name: info.name, mime_type: info.mimeType, size_bytes: info.size,
    document_type_id: ordner.typeId, house_id: o.house_id,
    onedrive_item_id: info.id, onedrive_drive_id: info.driveId, onedrive_web_url: info.webUrl, onedrive_path: ordner.path,
    note: `${ART_TEXT[kind]} – Mieter ${o.guest_name} (Wohnen auf Zeit)`,
  } as any]).select('id');
  if (error) throw error;
  if (!data || data.length === 0) throw new Error('Datei liegt in OneDrive, aber die Verknüpfung wurde nicht gespeichert.');
  const documentId = data[0].id as string;
  const { error: e3 } = await (supabase as any).from('document_links')
    .insert({ document_id: documentId, entity_type: 'mietangebot', entity_id: o.id, position: 2 }).select('id');
  if (e3) throw e3;
  return { documentId, webUrl: info.webUrl };
}

/** Link zu einem abgelegten Dokument (OneDrive). */
export const useDocumentLinks = (ids: (string | null | undefined)[]) => {
  const liste = ids.filter(Boolean) as string[];
  return useQuery({
    queryKey: ['rental-contract-docs', ...liste],
    enabled: liste.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase.from('documents').select('id, file_name, onedrive_web_url').in('id', liste);
      if (error) throw error;
      return (data || []) as { id: string; file_name: string; onedrive_web_url: string | null }[];
    },
  });
};
