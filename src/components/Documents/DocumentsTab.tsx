import React, { useState, useMemo, useRef, useEffect } from 'react';
import {
  Search, Plus, X, Upload, FileText, Image as ImageIcon, Folder, FolderPlus,
  ChevronRight, ExternalLink, Trash2, Settings2, List, FolderTree,
  ArrowLeft, AlertTriangle, Loader2, HardDrive, Cloud, Check,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useQuery } from '@tanstack/react-query';
import DocumentSettings from '@/components/Documents/DocumentSettings';
import {
  onedrive, bezugLabel, useOneDriveStatus, useDocumentTypes, useDocuments,
  useUploadDocument, useLinkExisting, useRemoveDocument, useEntities,
  useLocations, useSaveLocation,
  type DocumentType, type LinkTarget, type OneDriveFolder, type OneDriveFile,
  type EntityOption,
} from '@/hooks/useDocuments';

/**
 * DocumentsTab — Uebersicht, Suche und Ablage.
 *
 * ZUORDNUNG ist frei waehlbar. Der Dokumenttyp bestimmt sie NICHT mehr —
 * dieselbe Reinigungsrechnung haengt einmal an einem service_task
 * (Fensterputzen) und einmal an Boris (Sammelrechnung).
 *
 * ABLAGEORT wird nicht abgeleitet, sondern festgelegt: gemerkt je
 * Kombination aus Objekt und Dokumenttyp in document_locations.
 */

const LINK_TARGETS: { key: LinkTarget; label: string }[] = [
  { key: 'provider', label: 'Dienstleister' },
  { key: 'vendor', label: 'Absender' },
  { key: 'haus', label: 'Haus' },
  { key: 'buchung', label: 'Buchung' },
  { key: 'reinigung', label: 'Reinigung' },
  { key: 'waesche', label: 'Wäschelieferung' },
  { key: 'keine', label: 'kein Bezug' },
];

const COLORS: Record<string, string> = {
  emerald: 'bg-emerald-100 text-emerald-900',
  violet: 'bg-violet-100 text-violet-900',
  amber: 'bg-amber-100 text-amber-900',
  sky: 'bg-sky-100 text-sky-900',
  rose: 'bg-rose-100 text-rose-900',
  slate: 'bg-slate-100 text-slate-700',
};

const MONTHS = ['Januar','Februar','März','April','Mai','Juni','Juli','August','September','Oktober','November','Dezember'];
const fmtSize = (b?: number | null) =>
  b == null ? '' : b >= 1_048_576 ? `${(b / 1_048_576).toFixed(1)} MB` : `${Math.round(b / 1024)} KB`;
const fmtDate = (iso: string) => new Date(iso).toLocaleDateString('de-DE');

export default function DocumentsTab() {
  const { toast } = useToast();
  const status = useOneDriveStatus();
  const { data: types = [] } = useDocumentTypes(true);
  const { data: docs = [], isLoading } = useDocuments();
  const removeDoc = useRemoveDocument();

  const [view, setView] = useState<'suche' | 'ordner'>('suche');
  const [dialog, setDialog] = useState<'upload' | 'settings' | null>(null);
  const [query, setQuery] = useState('');
  const [fHouse, setFHouse] = useState<string[]>([]);
  const [fType, setFType] = useState<string[]>([]);
  const [fYear, setFYear] = useState<string[]>([]);
  const [limit, setLimit] = useState(25);

  const { data: houses = [] } = useQuery({
    queryKey: ['houses-min'],
    queryFn: async () => {
      const { data, error } = await supabase.from('houses').select('id, name').order('name');
      if (error) throw error;
      return data ?? [];
    },
  });

  const toggle = (arr: string[], set: (v: string[]) => void, v: string) => {
    set(arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);
    setLimit(25);
  };
  const resetAll = () => { setQuery(''); setFHouse([]); setFType([]); setFYear([]); setLimit(25); };
  const activeCount = fHouse.length + fType.length + fYear.length + (query ? 1 : 0);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    return docs.filter((d) => {
      if (fHouse.length && !fHouse.includes(d.house_id ?? '')) return false;
      if (fType.length && !fType.includes(d.document_type_id ?? '')) return false;
      if (fYear.length && !fYear.includes(d.created_at.slice(0, 4))) return false;
      if (!q) return true;
      return d.file_name.toLowerCase().includes(q)
        || (d.onedrive_path ?? '').toLowerCase().includes(q)
        || (d.document_types?.name ?? '').toLowerCase().includes(q)
        || bezugLabel(d).toLowerCase().includes(q);
    });
  }, [docs, query, fHouse, fType, fYear]);

  const countBy = (dim: 'house' | 'type' | 'year') => {
    const base = docs.filter((d) => {
      if (dim !== 'house' && fHouse.length && !fHouse.includes(d.house_id ?? '')) return false;
      if (dim !== 'type' && fType.length && !fType.includes(d.document_type_id ?? '')) return false;
      if (dim !== 'year' && fYear.length && !fYear.includes(d.created_at.slice(0, 4))) return false;
      return true;
    });
    const m: Record<string, number> = {};
    for (const d of base) {
      const k = dim === 'house' ? (d.house_id ?? '') : dim === 'type' ? (d.document_type_id ?? '') : d.created_at.slice(0, 4);
      m[k] = (m[k] || 0) + 1;
    }
    return m;
  };
  const cHouse = countBy('house'), cType = countBy('type'), cYear = countBy('year');
  const years = [...new Set(docs.map((d) => d.created_at.slice(0, 4)))].sort().reverse();

  const grouped = useMemo(() => {
    const g: { key: string; items: typeof matches }[] = [];
    for (const d of matches.slice(0, limit)) {
      const key = d.created_at.slice(0, 7);
      const last = g[g.length - 1];
      if (last && last.key === key) last.items.push(d);
      else g.push({ key, items: [d] });
    }
    return g;
  }, [matches, limit]);

  const Facet = ({ title, items, sel, set }: any) => (
    <div className="mb-5">
      <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">{title}</p>
      {items.map(({ key, label, n, color }: any) => (
        <button key={key} onClick={() => toggle(sel, set, key)} disabled={!n && !sel.includes(key)}
          className={`mb-0.5 flex w-full items-center justify-between rounded px-2 py-1.5 text-sm disabled:opacity-40 ${
            sel.includes(key) ? 'bg-primary/10 text-primary' : 'hover:bg-muted'}`}>
          <span className="flex min-w-0 items-center gap-2">
            {color && <span className={`h-2 w-2 shrink-0 rounded-full ${(COLORS[color] ?? COLORS.slate).split(' ')[0]}`} />}
            <span className="truncate">{label}</span>
          </span>
          <span className="ml-2 shrink-0 text-xs text-muted-foreground">{n || 0}</span>
        </button>
      ))}
    </div>
  );

  return (
    <div className="space-y-4">
      {status.data && !status.data.connected && (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3">
          <AlertTriangle className="h-5 w-5 shrink-0 text-amber-600" />
          <p className="flex-1 text-sm text-amber-900">
            {status.data.lastError
              ? 'Die OneDrive-Verbindung ist unterbrochen. Bitte neu anmelden.'
              : 'OneDrive ist noch nicht verbunden.'}
          </p>
          <Button size="sm" variant="outline" asChild>
            <a href={`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/onedrive-oauth`} target="_blank" rel="noreferrer">
              Mit OneDrive verbinden
            </a>
          </Button>
        </div>
      )}

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-xl font-medium">Dokumente</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {docs.length} Dateien
            {status.data?.account ? ` · verbunden mit ${status.data.account}` : ''}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setDialog('settings')}>
            <Settings2 className="mr-2 h-4 w-4" /> Einstellungen
          </Button>
          <Button onClick={() => setDialog('upload')} disabled={!status.data?.connected}>
            <Plus className="mr-2 h-4 w-4" /> Dokument ablegen
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <div className="flex min-w-[240px] flex-1 items-center gap-2 rounded-md border px-3">
          <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
          <input value={query} onChange={(e) => { setQuery(e.target.value); setView('suche'); setLimit(25); }}
            placeholder="Dateiname, Typ, Objekt, Ordner…"
            className="h-9 w-full bg-transparent text-sm outline-none" />
          {query && <button onClick={() => setQuery('')} aria-label="Suche leeren"><X className="h-4 w-4 text-muted-foreground" /></button>}
        </div>
        <div className="flex">
          <Button size="sm" variant={view === 'suche' ? 'default' : 'outline'} className="rounded-r-none"
            onClick={() => setView('suche')}>
            <List className="mr-1.5 h-3.5 w-3.5" /> Suche
          </Button>
          <Button size="sm" variant={view === 'ordner' ? 'default' : 'outline'} className="rounded-l-none border-l-0"
            onClick={() => setView('ordner')}>
            <FolderTree className="mr-1.5 h-3.5 w-3.5" /> Ordner
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center rounded-xl border py-16">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : view === 'suche' ? (
        <div className="grid gap-4 lg:grid-cols-[220px_1fr]">
          <aside className="h-fit rounded-xl border bg-card p-3">
            {activeCount > 0 && (
              <Button size="sm" variant="secondary" className="mb-3 w-full" onClick={resetAll}>
                {activeCount} Filter zurücksetzen
              </Button>
            )}
            <Facet title="Haus" sel={fHouse} set={setFHouse}
              items={[...houses.map((h: any) => ({ key: h.id, label: h.name, n: cHouse[h.id] })),
                      { key: '', label: 'ohne Haus', n: cHouse[''] }]} />
            <Facet title="Typ" sel={fType} set={setFType}
              items={types.map((t) => ({ key: t.id, label: t.name, n: cType[t.id], color: t.color }))} />
            <Facet title="Jahr" sel={fYear} set={setFYear}
              items={years.map((y) => ({ key: y, label: y, n: cYear[y] }))} />
          </aside>

          <div>
            <p className="mb-2 text-sm text-muted-foreground">{matches.length} Treffer</p>
            {grouped.length === 0 ? (
              <div className="rounded-xl border bg-card px-4 py-12 text-center">
                <p className="text-sm text-muted-foreground">
                  {docs.length === 0 ? 'Noch keine Dokumente abgelegt.' : 'Nichts gefunden.'}
                </p>
                {activeCount > 0 && (
                  <Button variant="link" size="sm" onClick={resetAll}>Filter zurücksetzen</Button>
                )}
              </div>
            ) : (
              <>
                {grouped.map((g) => (
                  <div key={g.key} className="mb-4">
                    <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      {MONTHS[Number(g.key.slice(5)) - 1]} {g.key.slice(0, 4)} · {g.items.length}
                    </p>
                    <div className="overflow-hidden rounded-xl border bg-card">
                      {g.items.map((d) => (
                        <Row key={d.id} d={d} onRemove={() =>
                          removeDoc.mutate({ id: d.id, itemId: d.onedrive_item_id }, {
                            onSuccess: () => toast({ title: 'Verknüpfung entfernt', description: 'Die Datei bleibt in OneDrive.' }),
                            onError: (e: any) => toast({ title: 'Fehler', description: e.message, variant: 'destructive' }),
                          })} />
                      ))}
                    </div>
                  </div>
                ))}
                {matches.length > limit && (
                  <Button variant="outline" className="w-full" onClick={() => setLimit((l) => l + 25)}>
                    Weitere {Math.min(25, matches.length - limit)} anzeigen
                  </Button>
                )}
              </>
            )}
          </div>
        </div>
      ) : (
        <FolderBrowser docs={docs} onRemove={(d: any) =>
          removeDoc.mutate({ id: d.id, itemId: d.onedrive_item_id }, {
            onSuccess: () => toast({ title: 'Verknüpfung entfernt', description: 'Die Datei bleibt in OneDrive.' }),
          })} />
      )}

      {dialog === 'upload' && (
        <AblageDialog types={types.filter((t) => t.is_active)} onClose={() => setDialog(null)} />
      )}
      {dialog === 'settings' && <DocumentSettings onClose={() => setDialog(null)} />}
    </div>
  );
}

function Row({ d, onRemove, hidePath }: any) {
  const isImg = (d.mime_type ?? '').startsWith('image/');
  const color = COLORS[d.document_types?.color ?? 'slate'] ?? COLORS.slate;
  return (
    <div className="grid grid-cols-1 gap-2 border-t px-4 py-2.5 first:border-t-0 sm:grid-cols-[2fr_1.6fr_100px_70px] sm:items-center">
      <div className="flex min-w-0 items-center gap-2.5">
        {isImg ? <ImageIcon className="h-4 w-4 shrink-0 text-primary" /> : <FileText className="h-4 w-4 shrink-0 text-primary" />}
        <div className="min-w-0">
          <p className="truncate text-sm">{d.file_name}</p>
          <p className="truncate font-mono text-xs text-muted-foreground">
            {hidePath ? fmtSize(d.size_bytes) : (d.onedrive_path || '—')}
          </p>
        </div>
      </div>
      <div className="min-w-0">
        <Badge variant="secondary" className={color}>{d.document_types?.name ?? 'ohne Typ'}</Badge>
        <p className="mt-0.5 truncate text-xs text-muted-foreground">{bezugLabel(d)}</p>
      </div>
      <span className="text-sm text-muted-foreground">{fmtDate(d.created_at)}</span>
      <div className="flex gap-3 sm:justify-end">
        {d.onedrive_web_url && (
          <a href={d.onedrive_web_url} target="_blank" rel="noreferrer" aria-label="In OneDrive öffnen">
            <ExternalLink className="h-[18px] w-[18px] text-muted-foreground hover:text-foreground" />
          </a>
        )}
        <button onClick={onRemove} aria-label="Verknüpfung entfernen">
          <Trash2 className="h-[18px] w-[18px] text-muted-foreground hover:text-destructive" />
        </button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------ Ordneransicht */

function FolderBrowser({ docs, onRemove }: any) {
  const [stack, setStack] = useState<{ id: string; name: string }[]>([{ id: 'root', name: 'OneDrive' }]);
  const current = stack[stack.length - 1];

  const { data, isLoading, error } = useQuery({
    queryKey: ['onedrive-children', current.id],
    queryFn: () => onedrive<{ folders: OneDriveFolder[]; files: OneDriveFile[] }>('listChildren', { parentId: current.id }),
  });

  const byItemId = useMemo(() => {
    const m: Record<string, any> = {};
    for (const d of docs) m[d.onedrive_item_id] = d;
    return m;
  }, [docs]);

  return (
    <div className="overflow-hidden rounded-xl border bg-card">
      <div className="flex items-center gap-2 border-b px-4 py-2.5">
        {stack.length > 1 && (
          <button onClick={() => setStack((s) => s.slice(0, -1))} aria-label="Eine Ebene zurück">
            <ArrowLeft className="h-4 w-4 text-muted-foreground" />
          </button>
        )}
        <span className="truncate font-mono text-xs text-muted-foreground">
          {stack.map((s) => s.name).join(' / ')}
        </span>
      </div>

      {isLoading && <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>}
      {error && <p className="px-4 py-8 text-center text-sm text-destructive">{(error as Error).message}</p>}

      {data?.folders.map((f) => (
        <button key={f.id} onClick={() => setStack((s) => [...s, { id: f.id, name: f.name }])}
          className="flex w-full items-center gap-2.5 border-t px-4 py-2.5 text-left hover:bg-muted/50">
          <Folder className="h-5 w-5 text-muted-foreground" />
          <span className="flex-1 text-sm">{f.name}</span>
          <span className="text-xs text-muted-foreground">{f.childCount}</span>
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
        </button>
      ))}

      {data?.files.map((f) => {
        const linked = byItemId[f.id];
        return linked ? (
          <Row key={f.id} d={linked} hidePath onRemove={() => onRemove(linked)} />
        ) : (
          <div key={f.id} className="flex items-center gap-2.5 border-t px-4 py-2.5">
            <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm text-muted-foreground">{f.name}</p>
              <p className="text-xs text-muted-foreground">{fmtSize(f.size)} · nicht verknüpft</p>
            </div>
            <a href={f.webUrl} target="_blank" rel="noreferrer" aria-label="In OneDrive öffnen">
              <ExternalLink className="h-[18px] w-[18px] text-muted-foreground hover:text-foreground" />
            </a>
          </div>
        );
      })}

      {data && data.folders.length === 0 && data.files.length === 0 && (
        <p className="border-t px-4 py-10 text-center text-sm text-muted-foreground">Dieser Ordner ist leer.</p>
      )}
    </div>
  );
}

/* --------------------------------------------------------------- Ablegen */

function AblageDialog({ types, onClose }: { types: DocumentType[]; onClose: () => void }) {
  const { toast } = useToast();
  const upload = useUploadDocument();
  const linkExisting = useLinkExisting();
  const { data: locations = [] } = useLocations();
  const saveLocation = useSaveLocation();

  const [source, setSource] = useState<'pc' | 'od'>('pc');
  const [file, setFile] = useState<File | null>(null);
  const [existing, setExisting] = useState<OneDriveFile | null>(null);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const [typeId, setTypeId] = useState(types[0]?.id ?? '');
  const [target, setTarget] = useState<LinkTarget>('provider');
  const [entityId, setEntityId] = useState('');
  const [entitySearch, setEntitySearch] = useState('');

  const [folder, setFolder] = useState<{ id: string; path: string } | null>(null);
  const [folderTouched, setFolderTouched] = useState(false);
  const [progress, setProgress] = useState(0);
  const [err, setErr] = useState('');

  const type = types.find((t) => t.id === typeId);
  const { data: entities = [], isFetching } = useEntities(target, entitySearch);
  const chosen: EntityOption | undefined = entities.find((e) => e.id === entityId);

  // Festgelegten Ablageort suchen: Objekt (bzw. dessen Ablageort-Objekt)
  // plus Dokumenttyp.
  const gemerkt = useMemo(() => {
    if (!chosen?.locationId || !typeId) return null;
    return locations.find(
      (l) => l.entity_type === chosen.locationType
        && l.entity_id === chosen.locationId
        && l.document_type_id === typeId,
    ) ?? null;
  }, [locations, chosen?.locationType, chosen?.locationId, typeId]);

  useEffect(() => {
    if (folderTouched) return;
    setFolder(gemerkt ? { id: gemerkt.onedrive_item_id, path: gemerkt.onedrive_path ?? '' } : null);
  }, [gemerkt, folderTouched]);

  // Objektwechsel setzt eine eigene Ordnerwahl zurueck — sonst laege die
  // naechste Datei still im Ordner des vorigen Objekts.
  useEffect(() => {
    setFolderTouched(false);
  }, [entityId, typeId, target]);

  const pick = (f?: File | null) => { if (f) { setFile(f); setErr(''); } };

  const submit = () => {
    if (!type) { setErr('Bitte einen Typ wählen.'); return; }
    if (source === 'pc' && !file) { setErr('Bitte zuerst eine Datei wählen.'); return; }
    if (source === 'od' && !existing) { setErr('Bitte eine Datei aus OneDrive wählen.'); return; }
    if (target !== 'keine' && !entityId) { setErr('Bitte ein Objekt zum Verknüpfen wählen.'); return; }
    if (source === 'pc' && !folder) { setErr('Bitte einen Zielordner wählen.'); return; }

    const links = {
      typeId,
      houseId: target === 'haus' ? entityId : (chosen?.houseId ?? null),
      bookingId: target === 'buchung' ? entityId : null,
      serviceTaskId: target === 'reinigung' ? entityId : null,
      linenOrderId: target === 'waesche' ? entityId : null,
      providerId: target === 'provider' ? entityId : null,
      vendorId: target === 'vendor' ? entityId : null,
    };

    // Die getroffene Wahl merken, damit sie beim naechsten Mal dasteht.
    const merken = () => {
      if (!folder || !chosen?.locationId) return;
      if (gemerkt && gemerkt.onedrive_item_id === folder.id) return;
      saveLocation.mutate({
        entityType: chosen.locationType,
        entityId: chosen.locationId,
        documentTypeId: typeId,
        itemId: folder.id,
        path: folder.path || null,
      });
    };

    if (source === 'pc') {
      upload.mutate({ file: file!, folderId: folder!.id, ...links, onProgress: setProgress }, {
        onSuccess: () => {
          merken();
          toast({ title: 'Abgelegt', description: `„${file!.name}" liegt in ${folder!.path || 'OneDrive'}.` });
          onClose();
        },
        onError: (e: any) => setErr(e.message),
      });
    } else {
      linkExisting.mutate({ itemId: existing!.id, ...links }, {
        onSuccess: () => {
          toast({ title: 'Verknüpft', description: `„${existing!.name}" ist verknüpft.` });
          onClose();
        },
        onError: (e: any) => setErr(e.message),
      });
    }
  };

  const busy = upload.isPending || linkExisting.isPending;

  return (
    <Dialog open onOpenChange={() => !busy && onClose()}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Dokument ablegen</DialogTitle>
          <DialogDescription>Typ und Zuordnung sind frei wählbar.</DialogDescription>
        </DialogHeader>

        <div>
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">1 · Was ist es</p>
          <div className="sm:w-1/2">
            <Label>Dokumenttyp</Label>
            <Select value={typeId} onValueChange={(v) => { setTypeId(v); setErr(''); }}>
              <SelectTrigger><SelectValue placeholder="Typ wählen…" /></SelectTrigger>
              <SelectContent>
                {types.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div>
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">2 · Wozu gehört es</p>
          <div className="grid gap-3 sm:grid-cols-[190px_1fr]">
            <div>
              <Label>Zuordnung</Label>
              <Select value={target} onValueChange={(v: any) => { setTarget(v); setEntityId(''); setErr(''); }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {LINK_TARGETS.map((l) => <SelectItem key={l.key} value={l.key}>{l.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Objekt</Label>
              {target === 'keine' ? (
                <Input disabled value="Kein Bezug" />
              ) : (
                <>
                  {target === 'buchung' && (
                    <Input className="mb-1.5" placeholder="Gast suchen…" value={entitySearch}
                      onChange={(e) => setEntitySearch(e.target.value)} />
                  )}
                  <Select value={entityId} onValueChange={(v) => { setEntityId(v); setErr(''); }}>
                    <SelectTrigger>
                      <SelectValue placeholder={isFetching ? 'Wird geladen…' : 'Objekt wählen…'} />
                    </SelectTrigger>
                    <SelectContent>
                      {entities.length === 0 && !isFetching && (
                        <div className="px-2 py-3 text-sm text-muted-foreground">
                          {target === 'vendor' ? 'Noch keine Absender — unter Einstellungen anlegen.' : 'Nichts gefunden.'}
                        </div>
                      )}
                      {entities.map((e) => <SelectItem key={e.id} value={e.id}>{e.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </>
              )}
            </div>
          </div>
        </div>

        <div>
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">3 · Datei wählen</p>
          <div className="mb-2 flex">
            <Button size="sm" variant={source === 'pc' ? 'default' : 'outline'} className="rounded-r-none"
              onClick={() => { setSource('pc'); setExisting(null); }}>
              <HardDrive className="mr-1.5 h-3.5 w-3.5" /> Mein PC
            </Button>
            <Button size="sm" variant={source === 'od' ? 'default' : 'outline'} className="rounded-l-none border-l-0"
              onClick={() => { setSource('od'); setFile(null); }}>
              <Cloud className="mr-1.5 h-3.5 w-3.5" /> OneDrive
            </Button>
          </div>

          {source === 'pc' ? (
            <div onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => { e.preventDefault(); setDragging(false); pick(e.dataTransfer.files?.[0]); }}
              className={`rounded-md border border-dashed p-4 text-center ${dragging ? 'border-primary bg-primary/5' : ''}`}>
              <Upload className="mx-auto h-6 w-6 text-muted-foreground" />
              <p className="mt-1.5 text-sm text-muted-foreground">Datei hierher ziehen</p>
              <Button size="sm" variant="outline" className="mt-2" onClick={() => inputRef.current?.click()}>
                Durchsuchen
              </Button>
              <input ref={inputRef} type="file" className="hidden" onChange={(e) => pick(e.target.files?.[0])} />
            </div>
          ) : (
            <OneDrivePicker selected={existing} onSelect={(f) => { setExisting(f); setErr(''); }} />
          )}

          {(file || existing) && (
            <div className="mt-2 flex items-center gap-2 rounded-md bg-muted px-2.5 py-2">
              <FileText className="h-[18px] w-[18px] shrink-0 text-primary" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm">{file ? file.name : existing!.name}</p>
                <p className="text-xs text-muted-foreground">
                  {file ? fmtSize(file.size) : 'liegt bereits in OneDrive'}
                </p>
              </div>
              {!busy && (
                <button onClick={() => { setFile(null); setExisting(null); }} aria-label="Auswahl entfernen">
                  <X className="h-4 w-4 text-muted-foreground" />
                </button>
              )}
            </div>
          )}
        </div>

        {source === 'pc' ? (
          <div>
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">4 · Datei ablegen in</p>
            <Zielordner
              gewaehlt={folder}
              vorbelegt={!!gemerkt && folder?.id === gemerkt.onedrive_item_id}
              onWaehlen={(id, path) => { setFolder({ id, path }); setFolderTouched(true); setErr(''); }}
            />
          </div>
        ) : (
          <div>
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">4 · Datei ablegen in</p>
            <div className="rounded-md border bg-muted/40 px-3 py-2.5">
              <p className="text-sm text-muted-foreground">
                Die Datei bleibt, wo sie in OneDrive liegt — sie wird nur verknüpft.
              </p>
            </div>
          </div>
        )}

        {busy && progress > 0 && (
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
            <div className="h-full bg-primary transition-all" style={{ width: `${progress}%` }} />
          </div>
        )}

        {err && <p className="text-sm text-destructive">{err}</p>}

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose} disabled={busy}>Abbrechen</Button>
          <Button onClick={submit} disabled={busy}>
            {busy ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> {progress > 0 ? `${progress}%` : 'Läuft…'}</>
                  : source === 'pc' ? 'Hochladen' : 'Verknüpfen'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function OneDrivePicker({ selected, onSelect }: { selected: OneDriveFile | null; onSelect: (f: OneDriveFile) => void }) {
  const [stack, setStack] = useState<{ id: string; name: string }[]>([{ id: 'root', name: 'OneDrive' }]);
  const current = stack[stack.length - 1];
  const pfad = stack.length === 1 ? 'OneDrive' : stack.slice(1).map((x) => x.name).join(' / ');

  const { data, isLoading } = useQuery({
    queryKey: ['onedrive-picker', current.id],
    queryFn: () => onedrive<{ folders: OneDriveFolder[]; files: OneDriveFile[] }>('listChildren', { parentId: current.id }),
  });

  return (
    <div className="rounded-md border">
      <div className="flex items-center gap-2 border-b px-2.5 py-2">
        {stack.length > 1 && (
          <button onClick={() => setStack((s) => s.slice(0, -1))} aria-label="Eine Ebene zurück">
            <ArrowLeft className="h-4 w-4 text-muted-foreground" />
          </button>
        )}
        <span className="min-w-0 flex-1 truncate font-mono text-xs text-muted-foreground">{pfad}</span>
      </div>

      <div className="max-h-52 overflow-y-auto p-1">
        {isLoading && <div className="flex justify-center py-5"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /></div>}

        {data?.folders.map((f) => (
          <button key={f.id} onClick={() => setStack((s) => [...s, { id: f.id, name: f.name }])}
            className="flex w-full items-center gap-2.5 rounded px-2 py-1.5 text-left text-sm hover:bg-muted">
            <Folder className="h-4 w-4 shrink-0 text-muted-foreground" />
            <span className="min-w-0 flex-1 truncate">{f.name}</span>
            <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
          </button>
        ))}

        {data?.files.map((f) => (
          <button key={f.id} onClick={() => onSelect(f)}
            className={`flex w-full items-center gap-2.5 rounded px-2 py-1.5 text-left text-sm ${selected?.id === f.id ? 'bg-primary/10 text-primary' : 'hover:bg-muted'}`}>
            <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
            <span className="min-w-0 flex-1 truncate">{f.name}</span>
            {selected?.id === f.id && <Check className="h-4 w-4 shrink-0" />}
          </button>
        ))}

        {data && data.folders.length === 0 && data.files.length === 0 && (
          <p className="px-2 py-4 text-center text-xs text-muted-foreground">Dieser Ordner ist leer.</p>
        )}
      </div>
    </div>
  );
}

/**
 * Zielordner — gleiche Bauform wie der Datei-Auswaehler.
 *
 * Ein Klick auf die ZEILE oeffnet den Ordner, gewaehlt wird ueber den
 * Knopf unten. Vorher trug jede Zeile zwei fast gleiche Schaltflaechen
 * (Haken und Pfeil); wer nur den Haken sah, kam nie tiefer als eine
 * Ebene.
 *
 * Der Pfad wird aus dem Klickweg gebaut, NICHT aus itemInfo — die
 * Aktion liefert bei einem Ordner den Pfad des ELTERNordners.
 */
function Zielordner({
  gewaehlt, vorbelegt, onWaehlen,
}: {
  gewaehlt: { id: string; path: string } | null;
  vorbelegt: boolean;
  onWaehlen: (id: string, path: string) => void;
}) {
  const { toast } = useToast();
  const [stack, setStack] = useState<{ id: string; name: string }[]>([{ id: 'root', name: 'OneDrive' }]);
  const [neuerName, setNeuerName] = useState('');
  const [legeAn, setLegeAn] = useState(false);
  const [busy, setBusy] = useState(false);

  const current = stack[stack.length - 1];
  const pfad = stack.slice(1).map((x) => x.name).join(' / ');

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['onedrive-ziel', current.id],
    queryFn: () => onedrive<{ folders: OneDriveFolder[] }>('listFolders', { parentId: current.id }),
  });

  const anlegen = async () => {
    const name = neuerName.trim();
    if (!name) return;
    if (/[/\:*?"<>|]/.test(name)) {
      toast({ title: 'Ungültiger Name', description: 'Ohne / \ : * ? " < > |', variant: 'destructive' });
      return;
    }
    setBusy(true);
    try {
      const created = await onedrive<{ id: string; name: string }>('createFolder', {
        parentId: current.id, name,
      });
      setNeuerName(''); setLegeAn(false);
      await refetch();
      // Hineingehen UND waehlen: wer einen Ordner anlegt, will dorthin.
      const kindPfad = [pfad, created.name].filter(Boolean).join(' / ');
      setStack((s) => [...s, { id: created.id, name: created.name }]);
      onWaehlen(created.id, kindPfad);
    } catch (e: any) {
      toast({ title: 'Ordner nicht angelegt', description: e.message, variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="rounded-md border">
        <div className="flex items-center gap-2 border-b px-2.5 py-2">
          {stack.length > 1 && (
            <button onClick={() => setStack((s) => s.slice(0, -1))} aria-label="Eine Ebene zurück">
              <ArrowLeft className="h-4 w-4 text-muted-foreground" />
            </button>
          )}
          <span className="min-w-0 flex-1 truncate font-mono text-xs text-muted-foreground">
            {pfad || 'OneDrive'}
          </span>
          <button onClick={() => setLegeAn((v) => !v)} aria-label="Ordner hier anlegen">
            <FolderPlus className="h-4 w-4 text-muted-foreground hover:text-primary" />
          </button>
        </div>

        {legeAn && (
          <div className="flex gap-1.5 border-b p-2">
            <Input autoFocus value={neuerName} className="h-8"
              onChange={(e) => setNeuerName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') anlegen(); if (e.key === 'Escape') setLegeAn(false); }}
              placeholder="Ordnername" />
            <Button size="sm" className="h-8" onClick={anlegen} disabled={busy}>
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Anlegen'}
            </Button>
          </div>
        )}

        <div className="max-h-52 overflow-y-auto p-1">
          {isLoading && <div className="flex justify-center py-5"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /></div>}

          {data?.folders.map((f) => (
            <button key={f.id} onClick={() => setStack((s) => [...s, { id: f.id, name: f.name }])}
              className="flex w-full items-center gap-2.5 rounded px-2 py-1.5 text-left text-sm hover:bg-muted">
              <Folder className="h-4 w-4 shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1 truncate">{f.name}</span>
              <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
            </button>
          ))}

          {data && data.folders.length === 0 && (
            <p className="px-2 py-4 text-center text-xs text-muted-foreground">Keine Unterordner.</p>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-3 border-t bg-muted/40 px-2.5 py-2">
          <Button size="sm" className="h-8" disabled={stack.length === 1}
            onClick={() => onWaehlen(current.id, pfad)}>
            Diesen Ordner nehmen
          </Button>
          <span className="text-xs text-muted-foreground">Zeile anklicken öffnet den Ordner</span>
        </div>
      </div>

      {gewaehlt ? (
        <div className="mt-2 rounded-md bg-primary/5 px-3 py-2">
          <p className="text-xs text-muted-foreground">
            Gewählt{vorbelegt ? ' · aus dem festgelegten Ablageort' : ''}
          </p>
          <p className="truncate font-mono text-sm text-primary">{gewaehlt.path || 'OneDrive (Stammordner)'}</p>
        </div>
      ) : (
        <p className="mt-2 text-xs text-muted-foreground">Noch kein Ordner gewählt.</p>
      )}
    </>
  );
}
