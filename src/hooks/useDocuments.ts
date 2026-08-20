import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

/**
 * useDocuments.ts — Zugriffe fuer die Dokumentenverwaltung.
 *
 * OneDrive wird ausschliesslich ueber die Edge Function `onedrive-api`
 * angesprochen. Der Zugriffstoken liegt in integration_tokens (ohne
 * RLS-Policy) und ist nur fuer service_role erreichbar — er darf den
 * Browser nie erreichen.
 *
 * Beim Hochladen gehen die Dateibytes NICHT durch die Edge Function:
 * sie liefert nur eine kurzlebige Upload-Adresse, der Browser laedt
 * direkt zu Microsoft. Damit faellt die 4-MB-Grenze weg.
 */

export type LinkTarget = 'haus' | 'buchung' | 'reinigung' | 'waesche' | 'keine';

export interface DocumentType {
  id: string;
  name: string;
  link_target: LinkTarget;
  folder_rule: string;
  color: string;
  is_active: boolean;
  sort_order: number;
}

export interface OneDriveFolder { id: string; name: string; childCount: number; }
export interface OneDriveFile {
  id: string; name: string; size: number;
  mimeType: string | null; webUrl: string; modified: string;
}

/** Ruft die Edge Function auf und wirft bei Fehlern Klartext. */
export async function onedrive<T = any>(action: string, payload: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await supabase.functions.invoke('onedrive-api', {
    body: { action, ...payload },
  });

  if (error) {
    // Der Antworttext steckt bei Nicht-2xx im context, nicht in error.message
    let detail = error.message;
    try {
      const body = await (error as any).context?.json?.();
      if (body?.error) detail = body.error;
      if (body?.needsReconnect) {
        const e = new Error(detail);
        (e as any).needsReconnect = true;
        throw e;
      }
    } catch (inner) {
      if ((inner as any)?.needsReconnect) throw inner;
    }
    throw new Error(detail);
  }
  if ((data as any)?.error) throw new Error((data as any).error);
  return data as T;
}

/* ---------------------------------------------------------------- Status */

export function useOneDriveStatus() {
  return useQuery({
    queryKey: ['onedrive-status'],
    queryFn: () => onedrive<{ connected: boolean; account: string | null; lastError: string | null }>('status'),
    staleTime: 60_000,
    retry: false,
  });
}

/* ----------------------------------------------------------------- Typen */

export function useDocumentTypes(includeInactive = false) {
  return useQuery({
    queryKey: ['document-types', includeInactive],
    queryFn: async () => {
      let q = supabase
        .from('document_types')
        .select('id, name, link_target, folder_rule, color, is_active, sort_order')
        .order('sort_order');
      if (!includeInactive) q = q.eq('is_active', true);

      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as DocumentType[];
    },
  });
}

export function useSaveDocumentType() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (t: Partial<DocumentType> & { name: string; link_target: LinkTarget; folder_rule: string }) => {
      const payload = {
        name: t.name.trim(),
        link_target: t.link_target,
        folder_rule: t.folder_rule.trim(),
        color: t.color ?? 'slate',
        is_active: t.is_active ?? true,
        sort_order: t.sort_order ?? 100,
      };

      const query = t.id
        ? supabase.from('document_types').update(payload).eq('id', t.id).select('id')
        : supabase.from('document_types').insert([payload]).select('id');

      const { data, error } = await query;
      if (error) throw error;
      if (!data || data.length === 0) throw new Error('Typ wurde nicht gespeichert (keine Zeile betroffen).');
      return data[0].id as string;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['document-types'] }),
  });
}

/* ------------------------------------------------------------- Dokumente */

export interface DocumentRow {
  id: string;
  file_name: string;
  size_bytes: number | null;
  mime_type: string | null;
  onedrive_item_id: string;
  onedrive_web_url: string | null;
  onedrive_path: string | null;
  created_at: string;
  document_type_id: string | null;
  house_id: string | null;
  booking_id: string | null;
  service_task_id: string | null;
  linen_order_id: string | null;
  document_types: { name: string; color: string } | null;
  houses: { name: string } | null;
}

export function useDocuments() {
  return useQuery({
    queryKey: ['documents'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('documents')
        .select(`
          id, file_name, size_bytes, mime_type,
          onedrive_item_id, onedrive_web_url, onedrive_path, created_at,
          document_type_id, house_id, booking_id, service_task_id, linen_order_id,
          document_types:document_type_id (name, color),
          houses:house_id (name)
        `)
        .order('created_at', { ascending: false })
        .limit(2000);

      if (error) throw error;
      return (data ?? []) as unknown as DocumentRow[];
    },
  });
}

/** Dokumente eines einzelnen Objekts — fuer den Abschnitt auf den Karten. */
export function useDocumentsFor(column: 'house_id' | 'booking_id' | 'service_task_id' | 'linen_order_id', id?: string) {
  return useQuery({
    queryKey: ['documents', column, id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('documents')
        .select(`
          id, file_name, size_bytes, onedrive_item_id, onedrive_web_url,
          onedrive_path, created_at, document_types:document_type_id (name, color)
        `)
        .eq(column, id!)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data ?? [];
    },
  });
}

/* --------------------------------------------------------- Ablage-Ablauf */

export interface UploadInput {
  file: File;
  folderId: string;
  typeId: string;
  houseId?: string | null;
  bookingId?: string | null;
  serviceTaskId?: string | null;
  linenOrderId?: string | null;
  note?: string;
  onProgress?: (percent: number) => void;
}

/** Laedt die Datei in Bloecken direkt zu Microsoft. */
async function putInChunks(uploadUrl: string, file: File, onProgress?: (p: number) => void) {
  const CHUNK = 5 * 320 * 1024; // 1,6 MB — Graph verlangt Vielfache von 320 KiB
  let start = 0;
  let last: any = null;

  while (start < file.size) {
    const end = Math.min(start + CHUNK, file.size);
    const res = await fetch(uploadUrl, {
      method: 'PUT',
      headers: {
        'Content-Length': String(end - start),
        'Content-Range': `bytes ${start}-${end - 1}/${file.size}`,
      },
      body: file.slice(start, end),
    });

    if (!res.ok && res.status !== 202) {
      throw new Error(`Upload fehlgeschlagen bei Byte ${start}: ${res.status} ${res.statusText}`);
    }
    if (res.status !== 202) last = await res.json();

    start = end;
    onProgress?.(Math.round((start / file.size) * 100));
  }

  if (!last?.id) throw new Error('Upload beendet, aber Microsoft hat keine Datei-ID geliefert.');
  return last.id as string;
}

export function useUploadDocument() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (input: UploadInput) => {
      // 1. Upload-Adresse anfordern
      const { uploadUrl } = await onedrive<{ uploadUrl: string }>('uploadSession', {
        folderId: input.folderId,
        fileName: input.file.name,
      });

      // 2. Bytes direkt zu Microsoft
      const itemId = await putInChunks(uploadUrl, input.file, input.onProgress);

      // 3. Metadaten holen (Name kann durch conflictBehavior abweichen)
      const info = await onedrive<{
        id: string; name: string; size: number; webUrl: string;
        mimeType: string | null; driveId: string | null; path: string;
      }>('itemInfo', { itemId });

      // 4. Verknuepfung schreiben
      const { data, error } = await supabase
        .from('documents')
        .insert([{
          file_name: info.name,
          mime_type: info.mimeType,
          size_bytes: info.size,
          document_type_id: input.typeId,
          house_id: input.houseId ?? null,
          booking_id: input.bookingId ?? null,
          service_task_id: input.serviceTaskId ?? null,
          linen_order_id: input.linenOrderId ?? null,
          onedrive_item_id: info.id,
          onedrive_drive_id: info.driveId,
          onedrive_web_url: info.webUrl,
          onedrive_path: info.path,
          note: input.note ?? null,
        }])
        .select('id');

      if (error) throw error;
      if (!data || data.length === 0) {
        throw new Error('Datei liegt in OneDrive, aber die Verknuepfung wurde nicht gespeichert.');
      }
      return data[0].id as string;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['documents'] });
    },
  });
}

/** Verknuepft eine Datei, die bereits in OneDrive liegt. */
export function useLinkExisting() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: Omit<UploadInput, 'file' | 'folderId' | 'onProgress'> & { itemId: string }) => {
      const info = await onedrive<any>('itemInfo', { itemId: input.itemId });

      const { data, error } = await supabase
        .from('documents')
        .insert([{
          file_name: info.name,
          mime_type: info.mimeType,
          size_bytes: info.size,
          document_type_id: input.typeId,
          house_id: input.houseId ?? null,
          booking_id: input.bookingId ?? null,
          service_task_id: input.serviceTaskId ?? null,
          linen_order_id: input.linenOrderId ?? null,
          onedrive_item_id: info.id,
          onedrive_drive_id: info.driveId,
          onedrive_web_url: info.webUrl,
          onedrive_path: info.path,
          note: input.note ?? null,
        }])
        .select('id');

      if (error) {
        if (error.code === '23505') throw new Error('Diese Datei ist bereits verknuepft.');
        throw error;
      }
      return data![0].id as string;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['documents'] }),
  });
}

/**
 * Entfernt die Verknuepfung. Die Datei bleibt in OneDrive.
 * Nur mit deleteFile=true wandert sie zusaetzlich in den Papierkorb.
 */
export function useRemoveDocument() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, itemId, deleteFile }: { id: string; itemId: string; deleteFile?: boolean }) => {
      if (deleteFile) await onedrive('deleteItem', { itemId });

      const { data, error } = await supabase.from('documents').delete().eq('id', id).select('id');
      if (error) throw error;
      if (!data || data.length === 0) throw new Error('Verknuepfung wurde nicht entfernt (keine Zeile betroffen).');
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['documents'] }),
  });
}

/* ------------------------------------------------- Objekte zum Verknuepfen */

export interface EntityOption { id: string; label: string; houseId: string | null; }

/** Laedt die auswaehlbaren Objekte je Verknuepfungsart. */
export function useEntities(target: LinkTarget, search: string) {
  return useQuery({
    queryKey: ['doc-entities', target, search],
    enabled: target !== 'keine',
    queryFn: async (): Promise<EntityOption[]> => {
      const like = `%${search.trim()}%`;

      if (target === 'haus') {
        const { data, error } = await supabase
          .from('houses').select('id, name').order('name').limit(50);
        if (error) throw error;
        return (data ?? []).map((h) => ({ id: h.id, label: h.name, houseId: h.id }));
      }

      if (target === 'buchung') {
        let q = supabase
          .from('bookings')
          .select('id, check_in, check_out, house_id, houses:house_id(name), guests!bookings_guest_id_fkey(name)')
          .order('check_in', { ascending: false })
          .limit(50);
        if (search.trim()) q = q.ilike('guests.name', like);

        const { data, error } = await q;
        if (error) throw error;
        return (data ?? []).map((b: any) => ({
          id: b.id,
          label: `${new Date(b.check_in).toLocaleDateString('de-DE')} · ${b.houses?.name ?? '—'} · ${b.guests?.name ?? 'ohne Gast'}`,
          houseId: b.house_id,
        }));
      }

      if (target === 'reinigung') {
        const { data, error } = await supabase
          .from('service_tasks')
          .select('id, scheduled_date, house_id, houses:house_id(name)')
          .eq('service_type', 'cleaning')
          .order('scheduled_date', { ascending: false })
          .limit(50);
        if (error) throw error;
        return (data ?? []).map((t: any) => ({
          id: t.id,
          label: `${new Date(t.scheduled_date).toLocaleDateString('de-DE')} · ${t.houses?.name ?? '—'}`,
          houseId: t.house_id,
        }));
      }

      const { data, error } = await supabase
        .from('linen_orders')
        .select('id, delivery_date, house_id, houses:house_id(name)')
        .order('delivery_date', { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data ?? []).map((o: any) => ({
        id: o.id,
        label: `${o.delivery_date ? new Date(o.delivery_date).toLocaleDateString('de-DE') : 'ohne Datum'} · ${o.houses?.name ?? '—'}`,
        houseId: o.house_id,
      }));
    },
  });
}

/** Loest {haus} und {jahr} auf und legt den Pfad in OneDrive an. */
export async function resolveFolder(rule: string, houseName?: string | null): Promise<{ id: string; path: string }> {
  const path = rule
    .replaceAll('{haus}', houseName ?? '')
    .replaceAll('{jahr}', String(new Date().getFullYear()))
    .split('/').map((s) => s.trim()).filter(Boolean)
    .join('/');

  if (!path) throw new Error('Der Speicherort des Typs ergibt keinen gueltigen Pfad.');
  return onedrive<{ id: string; path: string }>('resolvePath', { path });
}
