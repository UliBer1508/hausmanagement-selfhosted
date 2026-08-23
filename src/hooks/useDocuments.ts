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
 *
 * ABLAGEORTE (seit 20.08.2026): Der Ordner wird NICHT aus Platzhaltern
 * abgeleitet, sondern festgelegt. Uli waehlt ihn; die Wahl wird je
 * Kombination aus Objekt und Dokumenttyp in document_locations gemerkt
 * und beim naechsten Mal vorgeschlagen. document_types.folder_rule und
 * .link_target sind veraltet und werden nicht mehr ausgewertet.
 *
 * NOTIZ (seit 23.08.2026): documents.note ist ein freies Textfeld. Die
 * Spalte existierte seit dem ersten Entwurf und wurde von linkColumns()
 * auch geschrieben — nur gab es in der Oberflaeche kein Eingabefeld, und
 * die Leseabfrage holte die Spalte nicht. Beides ist jetzt ergaenzt.
 * Der Inhalt stammt ausschliesslich vom Menschen; keine Automatik
 * schreibt hier hinein.
 */

export type LinkTarget =
  | 'haus' | 'buchung' | 'reinigung' | 'waesche' | 'provider' | 'vendor' | 'keine';

/** Nur diese Arten haben einen eigenen Ablageort — die uebrigen nicht. */
export const LOCATION_TARGETS: LinkTarget[] = ['haus', 'provider', 'vendor'];

export interface DocumentType {
  id: string;
  name: string;
  folder_name: string;
  color: string;
  is_active: boolean;
  sort_order: number;
}

export interface DocumentVendor {
  id: string;
  name: string;
  note: string | null;
  is_active: boolean;
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
        .select('id, name, folder_name, color, is_active, sort_order')
        .order('sort_order');
      if (!includeInactive) q = q.eq('is_active', true);

      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as unknown as DocumentType[];
    },
  });
}

/** Ordnernamen duerfen keine Pfadtrenner enthalten — die DB prueft es auch. */
export const INVALID_FOLDER_CHARS = /[/\\:*?"<>|]/;

export function useSaveDocumentType() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (t: Partial<DocumentType> & { name: string; folder_name: string }) => {
      const name = t.name.trim();
      const folder = t.folder_name.trim();
      if (!name) throw new Error('Bitte einen Namen eingeben.');
      if (!folder) throw new Error('Bitte einen Ordnernamen eingeben.');
      if (INVALID_FOLDER_CHARS.test(folder)) {
        throw new Error('Der Ordnername darf keines dieser Zeichen enthalten: / \\ : * ? " < > |');
      }

      const payload = {
        name,
        folder_name: folder,
        color: t.color ?? 'slate',
        is_active: t.is_active ?? true,
        sort_order: t.sort_order ?? 100,
      };

      const query = t.id
        ? supabase.from('document_types').update(payload as any).eq('id', t.id).select('id')
        : supabase.from('document_types').insert([payload as any]).select('id');

      const { data, error } = await query;
      if (error) throw error;
      if (!data || data.length === 0) throw new Error('Typ wurde nicht gespeichert (keine Zeile betroffen).');
      return data[0].id as string;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['document-types'] }),
  });
}

/* -------------------------------------------------------------- Absender */

export function useVendors(includeInactive = false) {
  return useQuery({
    queryKey: ['document-vendors', includeInactive],
    queryFn: async () => {
      let q = supabase
        .from('document_vendors')
        .select('id, name, note, is_active')
        .order('name');
      if (!includeInactive) q = q.eq('is_active', true);

      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as unknown as DocumentVendor[];
    },
  });
}

export function useSaveVendor() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: Partial<DocumentVendor> & { name: string }) => {
      const name = v.name.trim();
      if (!name) throw new Error('Bitte einen Namen eingeben.');

      const payload = { name, note: v.note?.trim() || null, is_active: v.is_active ?? true };

      const query = v.id
        ? supabase.from('document_vendors').update(payload as any).eq('id', v.id).select('id')
        : supabase.from('document_vendors').insert([payload as any]).select('id');

      const { data, error } = await query;
      if (error) {
        if (error.code === '23505') throw new Error(`„${name}" gibt es bereits.`);
        throw error;
      }
      if (!data || data.length === 0) throw new Error('Absender wurde nicht gespeichert (keine Zeile betroffen).');
      return data[0].id as string;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['document-vendors'] }),
  });
}

export function useDeleteVendor() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await supabase.from('document_vendors').delete().eq('id', id).select('id');
      if (error) throw error;
      if (!data || data.length === 0) throw new Error('Absender wurde nicht gelöscht (keine Zeile betroffen).');
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['document-vendors'] }),
  });
}

/* ------------------------------------------------------------ Ablageorte */

export interface DocumentLocation {
  id: string;
  entity_type: LinkTarget;
  entity_id: string;
  document_type_id: string;
  onedrive_item_id: string;
  onedrive_path: string | null;
}

export function useLocations() {
  return useQuery({
    queryKey: ['document-locations'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('document_locations')
        .select('id, entity_type, entity_id, document_type_id, onedrive_item_id, onedrive_path');
      if (error) throw error;
      return (data ?? []) as unknown as DocumentLocation[];
    },
  });
}

/**
 * Merkt sich den gewaehlten Ordner fuer Objekt + Typ.
 * Beim naechsten Mal steht er dort automatisch.
 */
export function useSaveLocation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (l: {
      entityType: LinkTarget; entityId: string; documentTypeId: string;
      itemId: string; path?: string | null;
    }) => {
      const { data, error } = await supabase
        .from('document_locations')
        .upsert(
          {
            entity_type: l.entityType,
            entity_id: l.entityId,
            document_type_id: l.documentTypeId,
            onedrive_item_id: l.itemId,
            onedrive_path: l.path ?? null,
            updated_at: new Date().toISOString(),
          } as any,
          { onConflict: 'entity_type,entity_id,document_type_id' },
        )
        .select('id');

      if (error) throw error;
      if (!data || data.length === 0) throw new Error('Ablageort wurde nicht gespeichert (keine Zeile betroffen).');
      return data[0].id as string;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['document-locations'] }),
  });
}

export function useDeleteLocation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await supabase.from('document_locations').delete().eq('id', id).select('id');
      if (error) throw error;
      if (!data || data.length === 0) throw new Error('Ablageort wurde nicht entfernt (keine Zeile betroffen).');
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['document-locations'] }),
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
  provider_id: string | null;
  vendor_id: string | null;
  /** Freier Vermerk des Menschen. Leer = keine Notiz. */
  note: string | null;
  document_types: { name: string; color: string } | null;
  houses: { name: string } | null;
  service_providers: { name: string } | null;
  document_vendors: { name: string } | null;
  /** 2. und 3. Zuordnung, nachtraeglich aufgeloest (siehe useDocuments). */
  zusatz?: Zuordnung[];
}

/** Zeigt an, wozu ein Dokument gehoert — fuer Liste und Suche. */
export function bezugLabel(d: DocumentRow): string {
  return d.service_providers?.name
    ?? d.document_vendors?.name
    ?? d.houses?.name
    ?? '—';
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
          document_type_id, house_id, booking_id, service_task_id,
          linen_order_id, provider_id, vendor_id, note,
          document_types:document_type_id (name, color),
          houses:house_id (name),
          service_providers:provider_id (name),
          document_vendors:vendor_id (name)
        `)
        .order('created_at', { ascending: false })
        .limit(2000);

      if (error) throw error;
      const zeilen = (data ?? []) as unknown as DocumentRow[];
      if (zeilen.length === 0) return zeilen;

      // Zusatzzuordnungen in EINER Abfrage nachladen, nicht je Dokument.
      const { data: links, error: linkError } = await supabase
        .from('document_links')
        .select('document_id, entity_type, entity_id, position')
        .in('document_id', zeilen.map((z) => z.id))
        .order('position');

      if (linkError) {
        // Zusatzzuordnungen sind Beiwerk — die Liste bleibt nutzbar.
        console.error('document_links nicht gelesen:', linkError.message);
        return zeilen;
      }
      if (!links || links.length === 0) return zeilen;

      const namen = await objektNamen(links as any[]);

      const proDok = new Map<string, Zuordnung[]>();
      for (const l of links as any[]) {
        const liste = proDok.get(l.document_id) ?? [];
        liste.push({
          art: l.entity_type as LinkTarget,
          id: l.entity_id,
          label: namen.get(`${l.entity_type}:${l.entity_id}`) ?? 'unbekannt',
        });
        proDok.set(l.document_id, liste);
      }

      return zeilen.map((z) => ({ ...z, zusatz: proDok.get(z.id) ?? [] }));
    },
  });
}

/**
 * Loest die Namen zu einer gemischten Liste von Verweisen auf.
 * Je Tabelle EINE Abfrage, nicht je Verweis eine.
 */
async function objektNamen(links: Array<{ entity_type: string; entity_id: string }>) {
  const namen = new Map<string, string>();

  const idsVon = (art: string) =>
    [...new Set(links.filter((l) => l.entity_type === art).map((l) => l.entity_id))];

  const laden = async (
    art: string,
    tabelle: string,
    felder: string,
    beschriften: (r: any) => string,
  ) => {
    const ids = idsVon(art);
    if (ids.length === 0) return;
    const { data } = await supabase.from(tabelle as any).select(felder).in('id', ids);
    for (const r of (data ?? []) as any[]) namen.set(`${art}:${r.id}`, beschriften(r));
  };

  const datum = (d?: string | null) =>
    d ? new Date(d).toLocaleDateString('de-DE') : 'ohne Datum';

  await Promise.all([
    laden('haus', 'houses', 'id, name', (r) => r.name),
    laden('provider', 'service_providers', 'id, name', (r) => r.name),
    laden('vendor', 'document_vendors', 'id, name', (r) => r.name),
    laden('buchung', 'bookings',
      'id, check_in, houses:house_id(name), guests!bookings_guest_id_fkey(name)',
      (r) => `${datum(r.check_in)} · ${r.guests?.name ?? 'ohne Gast'}`),
    laden('reinigung', 'service_tasks', 'id, scheduled_date, houses:house_id(name)',
      (r) => `${datum(r.scheduled_date)} · ${r.houses?.name ?? '—'}`),
    laden('waesche', 'linen_orders', 'id, delivery_date, houses:house_id(name)',
      (r) => `${datum(r.delivery_date)} · ${r.houses?.name ?? '—'}`),
  ]);

  return namen;
}

/**
 * Dokumente eines einzelnen Objekts — fuer den Abschnitt auf den Karten.
 *
 * ACHTUNG, eigene Feldliste: Diese Abfrage ist NICHT dieselbe wie in
 * useDocuments(). Wer hier ein Feld braucht, muss es hier ergaenzen —
 * `note` wird bewusst nicht geladen, weil die Karten sie nicht anzeigen.
 */
export function useDocumentsFor(
  column: 'house_id' | 'booking_id' | 'service_task_id' | 'linen_order_id' | 'provider_id' | 'vendor_id',
  id?: string,
) {
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

/** Eine Zuordnung: Art plus Kennung des Objekts. */
export interface Zuordnung {
  art: LinkTarget;
  id: string;
  /** Nur fuer die Anzeige, wird nicht gespeichert. */
  label?: string;
}

export interface DocumentLinks {
  typeId: string;
  /**
   * 2. und 3. Zuordnung. Die ERSTE steht in den Spalten unten
   * (houseId, providerId, …) und ist der Hauptbezug — sie bestimmt
   * Ablageort und Anzeige.
   */
  zusatz?: Zuordnung[];
  houseId?: string | null;
  bookingId?: string | null;
  serviceTaskId?: string | null;
  linenOrderId?: string | null;
  providerId?: string | null;
  vendorId?: string | null;
  note?: string;
}

export interface UploadInput extends DocumentLinks {
  file: File;
  folderId: string;
  onProgress?: (percent: number) => void;
}

const linkColumns = (l: DocumentLinks) => ({
  document_type_id: l.typeId,
  house_id: l.houseId ?? null,
  booking_id: l.bookingId ?? null,
  service_task_id: l.serviceTaskId ?? null,
  linen_order_id: l.linenOrderId ?? null,
  provider_id: l.providerId ?? null,
  vendor_id: l.vendorId ?? null,
  note: l.note?.trim() || null,
});

/**
 * Aendert die Notiz eines bestehenden Dokuments.
 *
 * Leerer Text wird zu NULL — sonst stuende in der Datenbank ein leerer
 * String, den die Anzeige als „Notiz vorhanden" werten wuerde.
 *
 * `.select('id')` und die Pruefung auf null Zeilen sind Pflicht: Ohne sie
 * meldete ein Update auch dann Erfolg, wenn RLS oder eine falsche Kennung
 * gar keine Zeile getroffen haben.
 */
export function useUpdateDocumentNote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, note }: { id: string; note: string }) => {
      const wert = note.trim() || null;

      const { data, error } = await supabase
        .from('documents')
        .update({ note: wert } as any)
        .eq('id', id)
        .select('id');

      if (error) throw error;
      if (!data || data.length === 0) {
        throw new Error('Notiz wurde nicht gespeichert (keine Zeile betroffen).');
      }
      return wert;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['documents'] }),
  });
}

/**
 * Schreibt die 2. und 3. Zuordnung nach document_links.
 *
 * Bewusst NACH dem Dokument-Insert und mit eigenem Fehlerpfad: Die Datei
 * liegt dann bereits in OneDrive und das Dokument in der Datenbank. Ein
 * Fehlschlag hier darf den Vorgang nicht als gescheitert erscheinen
 * lassen — die Zusatzzuordnungen sind nachtraeglich ergaenzbar, ein
 * verlorener Upload nicht.
 */
async function zusatzSchreiben(documentId: string, zusatz?: Zuordnung[]) {
  const zeilen = (zusatz ?? [])
    .filter((z) => z && z.art && z.art !== 'keine' && z.id)
    .map((z, i) => ({
      document_id: documentId,
      entity_type: z.art,
      entity_id: z.id,
      position: i + 2, // die 1. Zuordnung steht am Dokument selbst
    }));

  if (zeilen.length === 0) return;

  const { error } = await supabase.from('document_links').insert(zeilen as any);
  if (error) console.error('Zusatzzuordnungen nicht gespeichert:', error.message);
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
          onedrive_item_id: info.id,
          onedrive_drive_id: info.driveId,
          onedrive_web_url: info.webUrl,
          onedrive_path: info.path,
          ...linkColumns(input),
        } as any])
        .select('id');

      if (error) throw error;
      if (!data || data.length === 0) {
        throw new Error('Datei liegt in OneDrive, aber die Verknuepfung wurde nicht gespeichert.');
      }

      await zusatzSchreiben(data[0].id as string, input.zusatz);
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
    mutationFn: async (input: DocumentLinks & { itemId: string }) => {
      const info = await onedrive<any>('itemInfo', { itemId: input.itemId });

      const { data, error } = await supabase
        .from('documents')
        .insert([{
          file_name: info.name,
          mime_type: info.mimeType,
          size_bytes: info.size,
          onedrive_item_id: info.id,
          onedrive_drive_id: info.driveId,
          onedrive_web_url: info.webUrl,
          onedrive_path: info.path,
          ...linkColumns(input),
        } as any])
        .select('id');

      if (error) {
        if (error.code === '23505') throw new Error('Diese Datei ist bereits verknuepft.');
        throw error;
      }

      await zusatzSchreiben(data![0].id as string, input.zusatz);
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

export interface EntityOption {
  id: string;
  label: string;
  houseId: string | null;
  /** Fuer den Ablageort: bei Buchung/Reinigung/Waesche das zugehoerige Haus. */
  locationType: LinkTarget;
  locationId: string | null;
}

/** Laedt die auswaehlbaren Objekte je Zuordnungsart. */
export function useEntities(target: LinkTarget, search: string) {
  return useQuery({
    queryKey: ['doc-entities', target, search],
    enabled: target !== 'keine',
    queryFn: async (): Promise<EntityOption[]> => {
      const like = `%${search.trim()}%`;

      if (target === 'haus') {
        const { data, error } = await supabase
          .from('houses').select('id, name').order('name').limit(100);
        if (error) throw error;
        return (data ?? []).map((h) => ({
          id: h.id, label: h.name, houseId: h.id,
          locationType: 'haus' as LinkTarget, locationId: h.id,
        }));
      }

      if (target === 'provider') {
        const { data, error } = await supabase
          .from('service_providers')
          .select('id, name, service_type')
          .eq('is_active', true)
          .order('name');
        if (error) throw error;
        return (data ?? []).map((p: any) => ({
          id: p.id, label: p.name, houseId: null,
          locationType: 'provider' as LinkTarget, locationId: p.id,
        }));
      }

      if (target === 'vendor') {
        const { data, error } = await supabase
          .from('document_vendors')
          .select('id, name')
          .eq('is_active', true)
          .order('name');
        if (error) throw error;
        return (data ?? []).map((v: any) => ({
          id: v.id, label: v.name, houseId: null,
          locationType: 'vendor' as LinkTarget, locationId: v.id,
        }));
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
          // Eine einzelne Buchung hat keinen eigenen Ordner — der Ablageort
          // haengt am Haus.
          locationType: 'haus' as LinkTarget,
          locationId: b.house_id,
        }));
      }

      if (target === 'reinigung') {
        const { data, error } = await supabase
          .from('service_tasks')
          .select('id, scheduled_date, house_id, provider_id, houses:house_id(name)')
          .eq('service_type', 'cleaning')
          .order('scheduled_date', { ascending: false })
          .limit(50);
        if (error) throw error;
        return (data ?? []).map((t: any) => ({
          id: t.id,
          label: `${new Date(t.scheduled_date).toLocaleDateString('de-DE')} · ${t.houses?.name ?? '—'}`,
          houseId: t.house_id,
          locationType: 'haus' as LinkTarget,
          locationId: t.house_id,
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
        locationType: 'haus' as LinkTarget,
        locationId: o.house_id,
      }));
    },
  });
}
