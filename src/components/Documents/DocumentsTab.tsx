import React, { useState, useMemo, useRef, useEffect } from 'react';
import {
  Search, Plus, X, Upload, FileText, Image as ImageIcon, Folder, FolderPlus,
  ChevronRight, ExternalLink, Trash2, Settings2, List, FolderTree,
  ArrowLeft, AlertTriangle, Loader2, HardDrive, Cloud, Check, StickyNote,
  ScanLine, Sparkles, Anchor,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
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
  useLocations, useSaveLocation, useVendors, useUpdateDocumentNote,
  type DocumentType, type LinkTarget, type OneDriveFolder, type OneDriveFile,
  type EntityOption,
} from '@/hooks/useDocuments';
import { leseDateiText, findeTreffer, trefferBegruendung, adressBegriffe, type Treffer } from '@/lib/pdfText';
import { useCreateLaundryInvoice } from '@/hooks/useLaundryInvoices';
import { getGuestName } from '@/lib/guestHelpers';

/**
 * DocumentsTab — Uebersicht, Suche und Ablage.
 *
 * ZUORDNUNG ist frei waehlbar. Der Dokumenttyp bestimmt sie NICHT mehr —
 * dieselbe Reinigungsrechnung haengt einmal an einem service_task
 * (Fensterputzen) und einmal an Boris (Sammelrechnung).
 *
 * ABLAGEORT wird nicht abgeleitet, sondern festgelegt: gemerkt je
 * Kombination aus Objekt und Dokumenttyp in document_locations.
 *
 * NOTIZ (23.08.2026): freier Text am Dokument, `documents.note`. In der
 * Liste steht nur ein Zeichen dafuer, DASS es eine Notiz gibt; der Text
 * selbst steht im Notiz-Fenster und ist dort aenderbar. Bewusst nicht in
 * der Zeile ausgeschrieben — die Zeile ist schon dicht, und eine Notiz
 * kann mehrere Saetze lang sein.
 */

const LINK_TARGETS: { key: LinkTarget; label: string }[] = [
  { key: 'provider', label: 'Dienstleister' },
  { key: 'vendor', label: 'Vendor' },
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
  // Dokument, dessen Notiz gerade angesehen/geaendert wird.
  const [noteDocId, setNoteDocId] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [fObjekt, setFObjekt] = useState<string[]>([]);
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

  const { data: providers = [] } = useQuery({
    queryKey: ['providers-min'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('service_providers').select('id, name').eq('is_active', true).order('name');
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: vendors = [] } = useVendors(true);

  // Das Notiz-Fenster liest aus der LISTE, nicht aus einer Kopie: nach dem
  // Speichern laedt useDocuments neu, und der angezeigte Text ist dann der
  // frisch gespeicherte. Eine eingefrorene Kopie zeigte den alten Stand.
  const noteDoc = useMemo(
    () => docs.find((d) => d.id === noteDocId) ?? null,
    [docs, noteDocId],
  );

  /**
   * Ein Dokument haengt an HOECHSTENS EINEM Objekt. Der Schluessel traegt die
   * Art mit, weil Kennungen aus verschiedenen Tabellen kommen und sonst
   * theoretisch kollidieren koennten.
   *
   * Bis 21.08.2026 filterte die Spalte nur nach `house_id`. Dokumente an
   * Dienstleistern oder Vendoren fielen samt und sonders unter „ohne Haus"
   * und liessen sich gar nicht filtern.
   */
  const objektKey = (d: any): string =>
    d.provider_id ? `provider:${d.provider_id}`
      : d.vendor_id ? `vendor:${d.vendor_id}`
      : d.house_id ? `haus:${d.house_id}`
      : '';

  /**
   * Alle Objekte eines Dokuments — Hauptbezug plus Zusatzzuordnungen.
   *
   * Folge: Ein Dokument mit mehreren Zuordnungen erscheint unter JEDEM
   * dieser Objekte, und die Summe der Zähler ist größer als die Zahl der
   * Dokumente. Das ist bei Mehrfachbezügen richtig so.
   */
  const objektKeys = (d: any): string[] => {
    const keys = [objektKey(d)];
    for (const z of d.zusatz ?? []) {
      if (z?.art && z?.id) keys.push(`${z.art === 'haus' ? 'haus' : z.art}:${z.id}`);
    }
    return keys;
  };

  const toggle = (arr: string[], set: (v: string[]) => void, v: string) => {
    set(arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);
    setLimit(25);
  };
  const resetAll = () => { setQuery(''); setFObjekt([]); setFType([]); setFYear([]); setLimit(25); };
  const activeCount = fObjekt.length + fType.length + fYear.length + (query ? 1 : 0);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    return docs.filter((d) => {
      if (fObjekt.length && !objektKeys(d).some((k) => fObjekt.includes(k))) return false;
      if (fType.length && !fType.includes(d.document_type_id ?? '')) return false;
      if (fYear.length && !fYear.includes(d.created_at.slice(0, 4))) return false;
      if (!q) return true;
      return d.file_name.toLowerCase().includes(q)
        || (d.onedrive_path ?? '').toLowerCase().includes(q)
        || (d.document_types?.name ?? '').toLowerCase().includes(q)
        || (d.note ?? '').toLowerCase().includes(q)
        || bezugLabel(d).toLowerCase().includes(q);
    });
  }, [docs, query, fObjekt, fType, fYear]);

  const countBy = (dim: 'objekt' | 'type' | 'year') => {
    const base = docs.filter((d) => {
      if (dim !== 'objekt' && fObjekt.length && !objektKeys(d).some((k) => fObjekt.includes(k))) return false;
      if (dim !== 'type' && fType.length && !fType.includes(d.document_type_id ?? '')) return false;
      if (dim !== 'year' && fYear.length && !fYear.includes(d.created_at.slice(0, 4))) return false;
      return true;
    });
    const m: Record<string, number> = {};
    for (const d of base) {
      if (dim === 'objekt') {
        // Ein Dokument zaehlt bei JEDEM verknuepften Objekt.
        for (const k of new Set(objektKeys(d))) m[k] = (m[k] || 0) + 1;
        continue;
      }
      const k = dim === 'type' ? (d.document_type_id ?? '') : d.created_at.slice(0, 4);
      m[k] = (m[k] || 0) + 1;
    }
    return m;
  };
  const cObjekt = countBy('objekt'), cType = countBy('type'), cYear = countBy('year');

  /**
   * Alle Objekte in EINER Spalte, nach Art gruppiert und farblich getrennt.
   * Bewusst nicht drei Spalten: ein Dokument haengt an genau einem Objekt,
   * getrennte Spalten waeren UND-verknuepft und lieferten bei zwei Arten
   * immer null Treffer.
   */
  const objektEintraege = useMemo(() => [
    ...(providers as any[]).map((p) => ({ key: `provider:${p.id}`, label: p.name, n: cObjekt[`provider:${p.id}`], color: 'emerald' })),
    ...(houses as any[]).map((h) => ({ key: `haus:${h.id}`, label: h.name, n: cObjekt[`haus:${h.id}`], color: 'amber' })),
    ...vendors.map((v) => ({ key: `vendor:${v.id}`, label: v.name, n: cObjekt[`vendor:${v.id}`], color: 'slate' })),
    { key: '', label: 'ohne Bezug', n: cObjekt[''] },
  ], [providers, houses, vendors, cObjekt]);
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
            placeholder="Dateiname, Typ, Objekt, Ordner, Notiz…"
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
            <Facet title="Objekt" sel={fObjekt} set={setFObjekt} items={objektEintraege} />
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
                        <Row key={d.id} d={d}
                          onNote={() => setNoteDocId(d.id)}
                          onRemove={() =>
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
        <FolderBrowser docs={docs}
          onNote={(d: any) => setNoteDocId(d.id)}
          onRemove={(d: any) =>
            removeDoc.mutate({ id: d.id, itemId: d.onedrive_item_id }, {
              onSuccess: () => toast({ title: 'Verknüpfung entfernt', description: 'Die Datei bleibt in OneDrive.' }),
            })} />
      )}

      {dialog === 'upload' && (
        <AblageDialog types={types.filter((t) => t.is_active)} onClose={() => setDialog(null)} />
      )}
      {dialog === 'settings' && <DocumentSettings onClose={() => setDialog(null)} />}
      {noteDoc && <NotizDialog d={noteDoc} onClose={() => setNoteDocId(null)} />}
    </div>
  );
}

function Row({ d, onRemove, onNote, hidePath }: any) {
  const isImg = (d.mime_type ?? '').startsWith('image/');
  const color = COLORS[d.document_types?.color ?? 'slate'] ?? COLORS.slate;
  const hatNotiz = !!(d.note && d.note.trim());
  return (
    <div className="grid grid-cols-1 gap-2 border-t px-4 py-2.5 first:border-t-0 sm:grid-cols-[2fr_1.6fr_100px_100px] sm:items-center">
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
        <p className="mt-0.5 truncate text-xs text-muted-foreground">
          {bezugLabel(d)}
          {/* 2. und 3. Zuordnung als Zusatz — der Hauptbezug steht vorn. */}
          {(d.zusatz ?? []).map((z: any) => (
            <span key={`${z.art}:${z.id}`} className="ml-1.5 rounded bg-muted px-1.5 py-0.5">
              {z.label}
            </span>
          ))}
        </p>
      </div>
      <span className="text-sm text-muted-foreground">{fmtDate(d.created_at)}</span>
      <div className="flex gap-3 sm:justify-end">
        {/* Notiz: gefuelltes Zeichen = vorhanden, blasses = noch keine.
            Der Text steht bewusst NICHT in der Zeile (kann lang sein). */}
        <button onClick={onNote}
          title={hatNotiz ? 'Notiz ansehen oder ändern' : 'Notiz hinzufügen'}
          aria-label={hatNotiz ? 'Notiz ansehen oder ändern' : 'Notiz hinzufügen'}>
          <StickyNote className={`h-[18px] w-[18px] ${
            hatNotiz ? 'fill-amber-200 text-amber-600' : 'text-muted-foreground/40 hover:text-muted-foreground'}`} />
        </button>
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

/* ---------------------------------------------------------------- Notiz */

/**
 * Notiz ansehen und aendern.
 *
 * Leerer Text loescht die Notiz (der Hook macht daraus NULL) — deshalb
 * braucht es keinen eigenen Loeschen-Knopf: Text markieren, entfernen,
 * speichern. Der Hinweis darunter sagt das ausdruecklich, sonst raet man.
 */
function NotizDialog({ d, onClose }: { d: any; onClose: () => void }) {
  const { toast } = useToast();
  const speichern = useUpdateDocumentNote();
  const [text, setText] = useState<string>(d.note ?? '');

  const unveraendert = text.trim() === (d.note ?? '').trim();

  const sichern = () => {
    speichern.mutate({ id: d.id, note: text }, {
      onSuccess: (wert) => {
        toast({
          title: wert ? 'Notiz gespeichert' : 'Notiz entfernt',
          description: d.file_name,
        });
        onClose();
      },
      onError: (e: any) => toast({ title: 'Fehler', description: e.message, variant: 'destructive' }),
    });
  };

  return (
    <Dialog open onOpenChange={() => !speichern.isPending && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Notiz</DialogTitle>
          <DialogDescription className="truncate">{d.file_name}</DialogDescription>
        </DialogHeader>

        <Textarea
          autoFocus
          rows={7}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Eigener Vermerk zu diesem Dokument…"
          disabled={speichern.isPending}
        />

        <p className="text-xs text-muted-foreground">
          Freier Text. Leeren und speichern entfernt die Notiz.
        </p>

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose} disabled={speichern.isPending}>Abbrechen</Button>
          <Button onClick={sichern} disabled={speichern.isPending || unveraendert}>
            {speichern.isPending ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Speichert…</> : 'Speichern'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------------------------------------ Ordneransicht */

function FolderBrowser({ docs, onRemove, onNote }: any) {
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
          <Row key={f.id} d={linked} hidePath
            onNote={() => onNote(linked)}
            onRemove={() => onRemove(linked)} />
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

/* ================================================================
   WAESCHERECHNUNG — Hilfsmittel
   ================================================================ */

interface RechnungsPosition {
  pos: number; artikel: string; bezeichnung: string;
  menge: number; einheit: string; preis: number;
  gesamt: number; summe: number; ust: number;
}

interface RechnungsErgebnis {
  ok: boolean;
  bereits_erfasst: boolean;
  erfasst_info: string | null;
  rechnung: {
    rechnungsnummer: string; rechnungsdatum: string;
    faelligkeitsdatum: string | null;
    bruttobetrag: number; nettobetrag: number;
  };
  positionen: RechnungsPosition[];
  preisabweichungen: Array<Record<string, unknown>>;
  warnungen: string[];
  hinweise: string[];
}

/*
 * Rechnungsartikel -> Mengenschluessel der Bestellung.
 *
 * WARUM NUR ZUM VERGLEICH: Die Zahlen dienen der Sichtpruefung, nicht der
 * Entscheidung. Teuni liefert nachweislich auch Vorrat (Badvorleger), und
 * die Paketmengen wichen an zwei geprueften Rechnungen von der Gaestezahl
 * ab (RG-0082: eine zu wenig, RG-0117: zwei zu viel). Die Auswahl trifft
 * daher der Mensch; die Tabelle zeigt nur, wo es klemmt.
 *
 * Das Waeschepaket entspricht einem Gast. Als Zaehlgroesse dient
 * `bedding`, weil es je Gast genau einmal vorkommt.
 *
 * Artikelnummern werden GROSS verglichen: Teuni schreibt sie mal
 * "MWHT", mal "mwht" (PDF gegenueber der frueheren Schnittstelle).
 */
const ARTIKEL_ZU_SCHLUESSEL: Record<string, string> = {
  MWR: 'bedding', MW3: 'bedding', MW4: 'bedding',
  MWHT: 'sink_towels',
  MWBVL: 'bath_mats',
  MWST: 'sauna_towels',
  MWBT: 'large_towels',
  // Lohnwaesche und Kleinunternehmerzeile haben keinen Mengenbezug.
  WT2: '', WT3: '', WTB2: '', WTB3: '', KLGEW: '', MWSPLT1: '',
};

const mengeAusBestellungen = (bestellungen: any[], schluessel: string) =>
  bestellungen.reduce((summe, b) => {
    const items = (b.items ?? {}) as Record<string, number>;
    return summe + Number(items[schluessel] ?? 0);
  }, 0);

function AblageDialog({ types, onClose }: { types: DocumentType[]; onClose: () => void }) {
  const { toast } = useToast();
  const upload = useUploadDocument();
  const linkExisting = useLinkExisting();
  const { data: locations = [] } = useLocations();
  const saveLocation = useSaveLocation();

  // Bereits verknuepfte Dateien, damit der Auswaehler sie kennzeichnen kann.
  // useDocuments ist von der Uebersicht her ohnehin geladen — react-query
  // liefert aus dem Zwischenspeicher, es entsteht keine zweite Abfrage.
  const { data: alleDokumente = [] } = useDocuments();
  const verknuepft = useMemo(
    () => new Map(alleDokumente.map((d) => [d.onedrive_item_id, d])),
    [alleDokumente],
  );

  const [source, setSource] = useState<'pc' | 'od'>('pc');
  const [file, setFile] = useState<File | null>(null);
  const [existing, setExisting] = useState<OneDriveFile | null>(null);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const [typeId, setTypeId] = useState(types[0]?.id ?? '');
  const [target, setTarget] = useState<LinkTarget>('provider');
  const [entityId, setEntityId] = useState('');
  const [entitySearch, setEntitySearch] = useState('');

  // 2. und 3. Zuordnung — optional, gehen nach document_links.
  const [art2, setArt2] = useState<LinkTarget>('keine');
  const [id2, setId2] = useState('');
  const [art3, setArt3] = useState<LinkTarget>('keine');
  const [id3, setId3] = useState('');

  // Freier Vermerk. Bleibt leer, wenn nichts eingegeben wird.
  const [note, setNote] = useState('');

  const [folder, setFolder] = useState<{ id: string; path: string } | null>(null);
  const [folderTouched, setFolderTouched] = useState(false);
  const [progress, setProgress] = useState(0);
  const [err, setErr] = useState('');

  /* ---------------------------------------------------------------
     DOKUMENT LESEN
     Liest den Text der gewaehlten PDF und traegt gefundene Attribute
     in die Felder ein. Was nicht gefunden wird, bleibt wie es ist —
     dann waehlt der Mensch selbst. Nichts wird ueberschrieben, was
     bereits von Hand gesetzt wurde.

     Es wird nur gesucht, was im System ANGELEGT ist. Ein unbekannter
     Absender kann nicht gefunden werden; das meldet die Anzeige.
  --------------------------------------------------------------- */
  const [liest, setLiest] = useState(false);
  const [leseFehler, setLeseFehler] = useState('');
  const [gefunden, setGefunden] = useState<{
    typ?: Treffer;
    zuordnungen: Array<{ art: LinkTarget; treffer: Treffer }>;
  } | null>(null);

  // Objektlisten fuer den Abgleich. Sie sind ohnehin geladen, weil die
  // Zuordnungszeilen sie brauchen — react-query liefert aus dem Speicher.
  const { data: alleProvider = [] } = useEntities('provider', '');
  const { data: alleVendoren = [] } = useEntities('vendor', '');

  /*
   * Haeuser mit ANSCHRIFT und OBJEKTNUMMER — eigene Abfrage, weil
   * useEntities nur id und name liefert.
   *
   * Grund: Fremde Absender benennen die Objekte nicht so wie das System.
   * Die Marktgemeinde Neukirchen schreibt „Chalet 17, Trattenbach 299",
   * nirgends steht „Wald Chalet". Ohne Anschrift als Suchbegriff bleibt
   * die Zuordnung leer, obwohl sie fuer einen Menschen eindeutig ist.
   */
  const { data: haeuserRoh = [] } = useQuery({
    queryKey: ['houses-suchbegriffe'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('houses')
        .select('id, name, address, external_objektnummer')
        .order('name');
      if (error) throw error;
      return data ?? [];
    },
  });

  const alleHaeuser = useMemo(
    () => (haeuserRoh as any[]).map((h) => ({
      id: h.id,
      label: h.name,
      begriffe: [
        ...adressBegriffe(h.address),
        ...(h.external_objektnummer ? [String(h.external_objektnummer)] : []),
      ],
    })),
    [haeuserRoh],
  );

  /* ---------------------------------------------------------------
     WAESCHERECHNUNG — Positionen lesen und Bestellungen zuordnen

     Kein neues Kennzeichen noetig: Der erkannte Absender ist ein
     service_provider, und dessen service_type sagt bereits, worum es
     geht ('laundry' vs. 'cleaning'). Ist der Absender der Waesche-
     Dienstleister, werden zusaetzlich die Rechnungspositionen gelesen
     und die noch nicht abgerechneten Bestellungen zur Auswahl gestellt.

     Die Zuordnung zu Buchungen entsteht NICHT aus der Rechnung — die
     Positionen sind Summen ohne Buchungsbezug. Sie entsteht ueber die
     Bestellungen: linen_orders traegt house_id und booking_id. Die
     Rechnung wird an die Bestellungen gehaengt, der Rest ergibt sich.

     Der Gastname kommt aus der guests-Relation, NICHT aus der Kopiespalte
     bookings.guest_name. Die faellt in Etappe 6 der Gastdaten-Entdopplung
     weg; wer sie hier abfragt, legt eine weitere Fundstelle an, die vorher
     gefunden werden muss — PostgREST antwortet dann mit einem Fehler, nicht
     mit einem leeren Ergebnis.
  --------------------------------------------------------------- */
  const createInvoice = useCreateLaundryInvoice();

  const { data: providerRoh = [] } = useQuery({
    queryKey: ['provider-service-type'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('service_providers')
        .select('id, name, service_type');
      if (error) throw error;
      return data ?? [];
    },
  });

  const [rechnung, setRechnung] = useState<RechnungsErgebnis | null>(null);
  const [rechnungProviderId, setRechnungProviderId] = useState<string | null>(null);
  const [gewaehlteBestellungen, setGewaehlte] = useState<Set<string>>(new Set());
  const [rechnungAnlegen, setRechnungAnlegen] = useState(true);

  // Offene Bestellungen dieses Dienstleisters. Seit dem 23.07.2026 ist
  // laundry_invoice_id bei allen Bestellungen null (Trigger entfernt) —
  // die Liste reicht daher weiter zurueck als der Rechnungszeitraum.
  // Vorausgewaehlt wird nur der Zeitraum, sichtbar bleibt alles.
  const { data: offeneBestellungen = [] } = useQuery({
    queryKey: ['offene-linen-orders', rechnungProviderId],
    enabled: !!rechnungProviderId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('linen_orders')
        .select(`
          id,
          delivery_date,
          order_date,
          total_items,
          items,
          house_id,
          houses:house_id (name),
          bookings:booking_id (
            id, check_in, number_of_guests,
            guests!bookings_guest_id_fkey (name)
          )
        `)
        .eq('provider_id', rechnungProviderId as string)
        .is('laundry_invoice_id', null)
        .order('delivery_date', { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  // Untere Zeitgrenze = Datum der zuletzt erfassten aelteren Rechnung.
  const { data: fruehereRechnungen = [] } = useQuery({
    queryKey: ['rechnungsdaten-fuer-zeitraum'],
    enabled: !!rechnung,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('laundry_invoices')
        .select('rechnungsdatum')
        .order('rechnungsdatum', { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const dokumentLesen = async () => {
    if (!file) return;
    setLiest(true);
    setLeseFehler('');
    setGefunden(null);

    try {
      const text = await leseDateiText(file);

      // 1 — Dokumenttyp
      const typTreffer = findeTreffer(
        text,
        types.map((t) => ({ id: t.id, name: t.name })),
      )[0];
      if (typTreffer) setTypeId(typTreffer.id);

      // 2 — Objekte. Alle drei Arten gemeinsam bewerten, damit der
      // staerkste Treffer gewinnt, egal aus welcher Liste er stammt.
      const alle = [
        ...findeTreffer(text, alleProvider.map((e) => ({ id: e.id, name: e.label })))
          .map((t) => ({ art: 'provider' as LinkTarget, treffer: t })),
        ...findeTreffer(text, alleVendoren.map((e) => ({ id: e.id, name: e.label })))
          .map((t) => ({ art: 'vendor' as LinkTarget, treffer: t })),
        ...findeTreffer(text, alleHaeuser.map((e) => ({ id: e.id, name: e.label, begriffe: e.begriffe })))
          .map((t) => ({ art: 'haus' as LinkTarget, treffer: t })),
      ];

      // Der ABSENDER gehoert auf Platz 1, nicht der punktstaerkste Treffer:
      // Die 1. Zuordnung bestimmt den Ablageort, und eine Sammelrechnung
      // gehoert zum Dienstleister — nicht zu einem der genannten Haeuser.
      const absender = alle.filter((x) => x.art === 'provider' || x.art === 'vendor')
        .sort((a, b) => b.treffer.punkte - a.treffer.punkte);
      const uebrige = alle.filter((x) => x.art === 'haus')
        .sort((a, b) => b.treffer.punkte - a.treffer.punkte);
      const reihe = [...absender, ...uebrige].slice(0, 3);

      if (reihe[0]) { setTarget(reihe[0].art); setEntityId(reihe[0].treffer.id); }
      if (reihe[1]) { setArt2(reihe[1].art); setId2(reihe[1].treffer.id); }
      if (reihe[2]) { setArt3(reihe[2].art); setId3(reihe[2].treffer.id); }

      setGefunden({ typ: typTreffer, zuordnungen: reihe });
      if (!typTreffer && reihe.length === 0) {
        setLeseFehler('Text gelesen, aber nichts Bekanntes gefunden. Bitte von Hand wählen.');
      }
      setErr('');

      // 3 — Waescherechnung? Der service_type des erkannten Dienstleisters
      //     entscheidet; ein zusaetzliches Kennzeichen braucht es nicht.
      const providerTreffer = reihe.find((x) => x.art === 'provider');
      const waescheDienstleister = providerTreffer
        ? (providerRoh as any[]).find(
            (pv) => pv.id === providerTreffer.treffer.id && pv.service_type === 'laundry',
          )
        : null;

      if (waescheDienstleister) {
        try {
          const base64 = await new Promise<string>((res, rej) => {
            const r = new FileReader();
            r.onload = () => res(String(r.result).split(',')[1] ?? '');
            r.onerror = () => rej(new Error('Datei nicht lesbar'));
            r.readAsDataURL(file);
          });
          const { data: rData, error: rErr } = await supabase.functions.invoke(
            'import-teuni-invoice', { body: { pdf_base64: base64 } },
          );
          // Kein Fehler nach aussen: Ein Lieferschein desselben Absenders
          // enthaelt keine Rechnungsnummer. Das ist kein Fehlerfall, es
          // gibt dann eben nichts zu uebernehmen.
          if (!rErr && rData?.ok) {
            setRechnung(rData as RechnungsErgebnis);
            setRechnungProviderId(waescheDienstleister.id);
            setRechnungAnlegen(!rData.bereits_erfasst);
          }
        } catch {
          /* stillschweigend: die Ablage funktioniert auch ohne Rechnungsdaten */
        }
      }
    } catch (e: any) {
      setLeseFehler(e.message);
    } finally {
      setLiest(false);
    }
  };

  const type = types.find((t) => t.id === typeId);
  const { data: entities = [], isFetching } = useEntities(target, entitySearch);
  const chosen: EntityOption | undefined = entities.find((e) => e.id === entityId);

  // Festgelegten Ablageort suchen: Objekt (bzw. dessen Ablageort-Objekt)
  // plus Dokumenttyp.
  /*
   * Vorauswahl: alles, was bis zum Rechnungsdatum geliefert wurde und
   * nach der zuletzt erfassten aelteren Rechnung liegt. Aeltere
   * Bestellungen bleiben sichtbar, aber unmarkiert — seit dem Wegfall
   * des Trigger-Automatismus liegt dort ein Altbestand, der sich beim
   * Durcharbeiten der Rechnungen nach und nach leert.
   */
  const vorRechnungsdatum = useMemo(() => {
    if (!rechnung) return null;
    const aktuell = rechnung.rechnung.rechnungsdatum;
    const aeltere = (fruehereRechnungen as any[])
      .map((r) => r.rechnungsdatum as string)
      .filter((d) => d && d < aktuell)
      .sort();
    return aeltere.length ? aeltere[aeltere.length - 1] : null;
  }, [rechnung, fruehereRechnungen]);

  useEffect(() => {
    if (!rechnung || offeneBestellungen.length === 0) return;
    const bis = rechnung.rechnung.rechnungsdatum;
    const treffer = (offeneBestellungen as any[]).filter((b) => {
      const d = (b.delivery_date ?? b.order_date) as string | null;
      if (!d) return false;
      if (d > bis) return false;
      return vorRechnungsdatum ? d > vorRechnungsdatum : true;
    });
    setGewaehlte(new Set(treffer.map((b) => b.id as string)));
  }, [rechnung, offeneBestellungen, vorRechnungsdatum]);

  const gewaehlteZeilen = useMemo(
    () => (offeneBestellungen as any[]).filter((b) => gewaehlteBestellungen.has(b.id)),
    [offeneBestellungen, gewaehlteBestellungen],
  );

  // Gegenrechnung je Rechnungsposition. Positionen ohne Mengenbezug
  // (Lohnwaesche, Kleinunternehmerzeile) bleiben aussen vor.
  const vergleich = useMemo(() => {
    if (!rechnung) return [];
    return rechnung.positionen
      .map((pos) => {
        const schluessel = ARTIKEL_ZU_SCHLUESSEL[pos.artikel.toUpperCase()];
        if (!schluessel) return null;
        return {
          artikel: pos.artikel,
          bezeichnung: pos.bezeichnung,
          laut_rechnung: pos.menge,
          laut_auswahl: mengeAusBestellungen(gewaehlteZeilen, schluessel),
        };
      })
      .filter(Boolean) as Array<{
        artikel: string; bezeichnung: string;
        laut_rechnung: number; laut_auswahl: number;
      }>;
  }, [rechnung, gewaehlteZeilen]);

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

  // Neue Datei -> altes Leseergebnis verwerfen. Sonst stuende unter der
  // neuen Datei noch die Begruendung der vorigen.
  const pick = (f?: File | null) => {
    if (!f) return;
    setFile(f);
    setErr('');
    setGefunden(null);
    setLeseFehler('');
    setRechnung(null);
    setRechnungProviderId(null);
    setGewaehlte(new Set());
  };

  const submit = () => {
    if (!type) { setErr('Bitte einen Typ wählen.'); return; }
    if (source === 'pc' && !file) { setErr('Bitte zuerst eine Datei wählen.'); return; }
    if (source === 'od' && !existing) { setErr('Bitte eine Datei aus OneDrive wählen.'); return; }
    if (target !== 'keine' && !entityId) { setErr('Bitte ein Objekt zum Verknüpfen wählen.'); return; }
    if (source === 'pc' && !folder) { setErr('Bitte einen Zielordner wählen.'); return; }

    const zusatz = [
      { art: art2, id: id2 },
      { art: art3, id: id3 },
    ].filter((z) => z.art !== 'keine' && z.id);

    const links = {
      typeId,
      zusatz,
      note,
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

    /*
     * Reihenfolge bewusst: erst Datei, dann Dokumentzeile, dann Rechnung.
     * Scheitert der Upload, entsteht KEINE Rechnung ohne Beleg. Scheitert
     * umgekehrt die Rechnung, liegt die Datei bereits sauber ab und der
     * Vorgang kann wiederholt werden — der harmlosere Fall.
     */
    const rechnungNachtragen = async (documentId: string) => {
      if (!rechnungAnlegen || !rechnung || rechnung.bereits_erfasst) return;
      const r = rechnung.rechnung;

      const angelegt: any = await createInvoice.mutateAsync({
        rechnungsnummer: r.rechnungsnummer,
        rechnungsdatum: r.rechnungsdatum,
        faelligkeitsdatum: r.faelligkeitsdatum ?? undefined,
        nettobetrag: r.nettobetrag,
        mwst_satz: 0,   // Teuni: Kleinunternehmerregelung, 0 % USt
        mwst_betrag: 0,
        bruttobetrag: r.bruttobetrag,
        // Positionen mitgeben — ohne sie waere spaeter keine Pruefung
        // moeglich, warum welche Bestellung zugeordnet wurde.
        positionen: rechnung.positionen.map((pos) => ({
          id: crypto.randomUUID(),
          rechnung_id: '',
          artikelnummer: pos.artikel,
          bezeichnung: pos.bezeichnung,
          menge: pos.menge,
          einzelpreis: pos.preis,
          gesamtpreis: pos.summe,
        })),
        notes: `Aus PDF gelesen bei der Ablage am ${new Date().toLocaleDateString('de-DE')}`,
      });

      if (!angelegt?.id) return;

      // Bestellungen an die Rechnung haengen. Ueber deren booking_id und
      // house_id haengt damit auch die Buchung an der Rechnung.
      const ids = [...gewaehlteBestellungen];
      if (ids.length > 0) {
        const { data: zug, error: zErr } = await supabase
          .from('linen_orders')
          .update({ laundry_invoice_id: angelegt.id })
          .in('id', ids)
          .select('id');
        if (zErr) throw zErr;
        if (!zug || zug.length === 0) {
          throw new Error('Rechnung angelegt, aber keine Bestellung wurde zugeordnet.');
        }
      }

      // Beleg und Rechnung verbinden. `.select('id')` ist Pflicht: ohne
      // die Zeilenpruefung meldete das Update auch dann Erfolg, wenn RLS
      // oder eine falsche Kennung gar nichts getroffen haben.
      const { data: verk, error: vErr } = await supabase
        .from('documents')
        .update({ laundry_invoice_id: angelegt.id } as any)
        .eq('id', documentId)
        .select('id');
      if (vErr) throw vErr;
      if (!verk || verk.length === 0) {
        throw new Error('Rechnung angelegt, aber die Verknüpfung zum Beleg wurde nicht gespeichert.');
      }
    };

    if (source === 'pc') {
      upload.mutate({ file: file!, folderId: folder!.id, ...links, onProgress: setProgress }, {
        onSuccess: async (documentId: string) => {
          merken();
          try {
            await rechnungNachtragen(documentId);
          } catch (e: any) {
            // Die Datei liegt bereits richtig. Der Dialog bleibt offen,
            // damit der Fehler nicht unbemerkt verschwindet.
            setErr(`Datei abgelegt, aber: ${e.message}`);
            return;
          }
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

          {/* Drei Zuordnungen, alle gleich aufgebaut: Art links, Auswahl rechts.
              Die ERSTE ist Pflicht und bestimmt den Ablageort — sie landet in
              den Spalten von `documents`. Die zweite und dritte kommen nach
              document_links; nur so sind zwei Häuser gleichzeitig möglich. */}
          <ZuordnungZeile
            nummer={1}
            art={target}
            objektId={entityId}
            onArt={(v) => { setTarget(v); setEntityId(''); setErr(''); }}
            onObjekt={(v) => { setEntityId(v); setErr(''); }}
          />
          <ZuordnungZeile
            nummer={2}
            art={art2}
            objektId={id2}
            onArt={(v) => { setArt2(v); setId2(''); }}
            onObjekt={setId2}
          />
          <ZuordnungZeile
            nummer={3}
            art={art3}
            objektId={id3}
            onArt={(v) => { setArt3(v); setId3(''); }}
            onObjekt={setId3}
          />

          <p className="mt-1.5 text-xs text-muted-foreground">
            Die 1. Zuordnung bestimmt den Ablageort. Die weiteren sind optional.
          </p>
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
            <OneDrivePicker
              selected={existing}
              verknuepft={verknuepft}
              onSelect={(f) => { setExisting(f); setErr(''); }}
            />
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
                <button onClick={() => { setFile(null); setExisting(null); setGefunden(null); setLeseFehler(''); }}
                  aria-label="Auswahl entfernen">
                  <X className="h-4 w-4 text-muted-foreground" />
                </button>
              )}
            </div>
          )}

          {/* Lesen geht nur bei einer Datei vom PC: eine Datei aus OneDrive
              liegt dort und muesste erst heruntergeladen werden. */}
          {file && (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) && (
            <>
              <Button variant="outline" className="mt-2 w-full" onClick={dokumentLesen} disabled={liest || busy}>
                {liest
                  ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Liest…</>
                  : <><ScanLine className="mr-2 h-4 w-4" /> Dokument lesen</>}
              </Button>

              {leseFehler && (
                <p className="mt-1.5 text-xs text-amber-700">{leseFehler}</p>
              )}

              {gefunden && (gefunden.typ || gefunden.zuordnungen.length > 0) && (
                <div className="mt-1.5 rounded-md bg-primary/5 px-2.5 py-2">
                  <p className="mb-1 flex items-center gap-1.5 text-xs font-medium text-primary">
                    <Sparkles className="h-3.5 w-3.5" /> Aus dem Dokument gelesen — Felder oben sind
                    vorbelegt und frei änderbar
                  </p>
                  {gefunden.typ && (
                    <p className="text-xs text-muted-foreground">
                      Typ <span className="font-medium text-foreground">{gefunden.typ.name}</span>
                      {' · '}{trefferBegruendung(gefunden.typ)}
                    </p>
                  )}
                  {gefunden.zuordnungen.map((z, i) => (
                    <p key={`${z.art}:${z.treffer.id}`} className="text-xs text-muted-foreground">
                      {i + 1}. Zuordnung{' '}
                      <span className="font-medium text-foreground">{z.treffer.name}</span>
                      {' · '}{trefferBegruendung(z.treffer)}
                    </p>
                  ))}
                </div>
              )}

              {/* ---- Waescherechnung: Positionen und Zuordnung ---- */}
              {rechnung && (
                <div className="mt-2 rounded-md border border-amber-300 bg-amber-50 p-3">
                  <p className="mb-1 text-sm font-semibold text-amber-900">
                    Rechnung {rechnung.rechnung.rechnungsnummer} vom{' '}
                    {fmtDate(rechnung.rechnung.rechnungsdatum)}
                    {' · '}
                    {rechnung.rechnung.bruttobetrag.toFixed(2).replace('.', ',')} €
                  </p>

                  {rechnung.bereits_erfasst && (
                    <p className="mb-2 text-xs font-medium text-amber-800">
                      {rechnung.erfasst_info} — es wird keine zweite Rechnung angelegt.
                    </p>
                  )}

                  {rechnung.warnungen.length > 0 && (
                    <ul className="mb-2 list-disc pl-4 text-xs text-amber-800">
                      {rechnung.warnungen.map((w, i) => <li key={i}>{w}</li>)}
                    </ul>
                  )}

                  {/* Positionen */}
                  <table className="mb-3 w-full text-xs">
                    <tbody>
                      {rechnung.positionen.map((pos) => (
                        <tr key={pos.pos} className="border-b border-amber-200 last:border-0">
                          <td className="py-1 pr-2 font-mono">{pos.artikel}</td>
                          <td className="py-1 pr-2">{pos.bezeichnung}</td>
                          <td className="py-1 pr-2 text-right whitespace-nowrap">
                            {pos.menge} {pos.einheit}
                          </td>
                          <td className="py-1 text-right whitespace-nowrap">
                            {pos.summe.toFixed(2).replace('.', ',')} €
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>

                  {/* Bestellungen zum Abhaken */}
                  {offeneBestellungen.length > 0 && (
                    <>
                      <p className="mb-1 text-xs font-medium text-amber-900">
                        Welche Wäschebestellungen deckt diese Rechnung ab?
                      </p>
                      <p className="mb-1.5 text-xs text-amber-800">
                        Vorausgewählt ist der Zeitraum
                        {vorRechnungsdatum ? ` nach dem ${fmtDate(vorRechnungsdatum)}` : ''}
                        {' '}bis zum Rechnungsdatum. Ältere bleiben sichtbar.
                      </p>
                      <div className="mb-3 max-h-52 space-y-1 overflow-y-auto rounded bg-white/60 p-1.5">
                        {(offeneBestellungen as any[]).map((b) => (
                          <label key={b.id} className="flex cursor-pointer items-start gap-2 rounded px-1.5 py-1 text-xs hover:bg-amber-100">
                            <input
                              type="checkbox"
                              className="mt-0.5"
                              checked={gewaehlteBestellungen.has(b.id)}
                              onChange={(e) => {
                                const next = new Set(gewaehlteBestellungen);
                                if (e.target.checked) next.add(b.id); else next.delete(b.id);
                                setGewaehlte(next);
                              }}
                            />
                            <span className="min-w-0 flex-1">
                              <span className="font-medium">
                                {b.delivery_date ? fmtDate(b.delivery_date) : 'ohne Lieferdatum'}
                              </span>
                              {' · '}{b.houses?.name ?? 'Haus unbekannt'}
                              {b.bookings && (
                                <>
                                  {' · '}{getGuestName(b.bookings)}
                                  {' · '}{b.bookings.number_of_guests} Gäste
                                </>
                              )}
                            </span>
                          </label>
                        ))}
                      </div>

                      {/* Gegenrechnung — reine Sichtpruefung, blockiert nichts */}
                      {vergleich.length > 0 && (
                        <table className="mb-2 w-full text-xs">
                          <thead>
                            <tr className="text-amber-900">
                              <th className="text-left font-medium">Artikel</th>
                              <th className="text-right font-medium">Rechnung</th>
                              <th className="text-right font-medium">Auswahl</th>
                              <th className="w-6" />
                            </tr>
                          </thead>
                          <tbody>
                            {vergleich.map((v) => {
                              const gleich = v.laut_rechnung === v.laut_auswahl;
                              return (
                                <tr key={v.artikel}>
                                  <td className="py-0.5">{v.bezeichnung}</td>
                                  <td className="py-0.5 text-right">{v.laut_rechnung}</td>
                                  <td className="py-0.5 text-right">{v.laut_auswahl}</td>
                                  <td className="py-0.5 text-right">{gleich ? '✓' : '≠'}</td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      )}
                      <p className="mb-2 text-xs text-amber-800">
                        Abweichungen sind kein Hindernis: Teuni liefert auch Vorrat,
                        und die Paketmengen wichen schon von der Gästezahl ab.
                        Die Auswahl entscheidest du.
                      </p>
                    </>
                  )}

                  {!rechnung.bereits_erfasst && (
                    <label className="flex cursor-pointer items-center gap-2 text-xs font-medium text-amber-900">
                      <input
                        type="checkbox"
                        checked={rechnungAnlegen}
                        onChange={(e) => setRechnungAnlegen(e.target.checked)}
                      />
                      Rechnung anlegen, mit diesem Beleg und den gewählten
                      Bestellungen verknüpfen
                    </label>
                  )}
                </div>
              )}
            </>
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

        {/* Notiz: rein optional, freier Text. Wird spaeter ueber das
            Notiz-Zeichen in der Liste geaendert. */}
        <div>
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            5 · Notiz <span className="normal-case tracking-normal">(optional)</span>
          </p>
          <Textarea
            rows={2}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Eigener Vermerk zu diesem Dokument…"
            disabled={busy}
          />
        </div>

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

/**
 * Eine Zuordnungszeile: Art links, Objekt rechts.
 *
 * Jede Zeile laedt ihre eigene Objektliste ueber useEntities. Drei Zeilen
 * heissen drei Abfragen — bei „kein Bezug" laeuft keine, und die Ergebnisse
 * werden von react-query je Art zwischengespeichert, sodass zwei Zeilen mit
 * derselben Art nur einmal laden.
 */
function ZuordnungZeile({
  nummer, art, objektId, onArt, onObjekt,
}: {
  nummer: 1 | 2 | 3;
  art: LinkTarget;
  objektId: string;
  onArt: (v: LinkTarget) => void;
  onObjekt: (v: string) => void;
}) {
  const [suche, setSuche] = useState('');
  const { data: objekte = [], isFetching } = useEntities(art, suche);

  return (
    <div className="mb-3 grid gap-3 sm:grid-cols-[190px_1fr]">
      <div>
        <Label>
          {nummer}. Zuordnung
          {nummer > 1 && <span className="ml-1 font-normal text-muted-foreground">optional</span>}
        </Label>
        <Select value={art} onValueChange={(v: any) => onArt(v)}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            {LINK_TARGETS.map((l) => <SelectItem key={l.key} value={l.key}>{l.label}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <div>
        <Label>Objekt</Label>
        {art === 'keine' ? (
          <Input disabled value="—" />
        ) : (
          <>
            {art === 'buchung' && (
              <Input className="mb-1.5" placeholder="Gast suchen…" value={suche}
                onChange={(e) => setSuche(e.target.value)} />
            )}
            <Select value={objektId} onValueChange={onObjekt}>
              <SelectTrigger>
                <SelectValue placeholder={isFetching ? 'Wird geladen…' : 'Objekt wählen…'} />
              </SelectTrigger>
              <SelectContent>
                {objekte.length === 0 && !isFetching && (
                  <div className="px-2 py-3 text-sm text-muted-foreground">
                    {art === 'vendor'
                      ? 'Noch keine Vendoren — unter Einstellungen anlegen.'
                      : 'Nichts gefunden.'}
                  </div>
                )}
                {objekte.map((e) => <SelectItem key={e.id} value={e.id}>{e.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </>
        )}
      </div>
    </div>
  );
}

/**
 * Datei-Auswaehler fuer Quelle „OneDrive".
 *
 * Zeigt an, welche Dateien BEREITS verknuepft sind. Ohne diese Kennzeichnung
 * sahen alle Dateien gleich aus: Man waehlte eine schon verknuepfte, bekam
 * beim Hochladen die Meldung „bereits verknuepft" und wusste vorher nicht,
 * woran man war. Eine bereits verknuepfte Datei ist nicht anklickbar.
 */
function OneDrivePicker({
  selected, verknuepft, onSelect,
}: {
  selected: OneDriveFile | null;
  verknuepft: Map<string, any>;
  onSelect: (f: OneDriveFile) => void;
}) {
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

        {data?.files.map((f) => {
          const schon = verknuepft.get(f.id);
          return (
            <button
              key={f.id}
              onClick={() => !schon && onSelect(f)}
              disabled={!!schon}
              title={schon ? `Bereits verknüpft: ${schon.document_types?.name ?? 'ohne Typ'} · ${bezugLabel(schon)}` : undefined}
              className={`flex w-full items-center gap-2.5 rounded px-2 py-1.5 text-left text-sm ${
                schon ? 'cursor-not-allowed opacity-60'
                  : selected?.id === f.id ? 'bg-primary/10 text-primary'
                  : 'hover:bg-muted'}`}
            >
              <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1 truncate">{f.name}</span>
              {schon ? (
                <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
                  verknüpft
                </span>
              ) : selected?.id === f.id ? (
                <Check className="h-4 w-4 shrink-0" />
              ) : null}
            </button>
          );
        })}

        {data && data.folders.length === 0 && data.files.length === 0 && (
          <p className="px-2 py-4 text-center text-xs text-muted-foreground">Dieser Ordner ist leer.</p>
        )}

        {data && data.files.length > 0 && data.files.every((f) => verknuepft.has(f.id)) && (
          <p className="px-2 py-2 text-center text-xs text-muted-foreground">
            Alle Dateien in diesem Ordner sind bereits verknüpft.
          </p>
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
/**
 * Startordner ("Anker") fuer den Zielordner-Baum.
 *
 * Gemerkt wird die OneDrive-KENNUNG, nicht der Pfad — so ueberlebt der
 * Anker Umbenennen und Verschieben in OneDrive. Der Pfad wird nur zur
 * Anzeige mitgefuehrt und darf veralten.
 *
 * Bewusst in localStorage und nicht in der Datenbank: Es gibt im Projekt
 * keine allgemeine Einstellungstabelle, und document_locations laesst
 * durch seinen CHECK-Constraint keinen globalen Eintrag zu. Eine eigene
 * Tabelle fuer eine einzige Einstellung waere unverhaeltnismaessig.
 * FOLGE: Der Anker gilt je Geraet und Browser — auf dem Handy muss er
 * einmal neu gesetzt werden.
 */
const ANKER_KEY = 'dokumente.startordner';

interface Anker { id: string; name: string; path: string; }

function ankerLesen(): Anker | null {
  try {
    const roh = localStorage.getItem(ANKER_KEY);
    if (!roh) return null;
    const a = JSON.parse(roh);
    return a?.id && a?.name ? a as Anker : null;
  } catch {
    // Beschaedigter Eintrag darf den Dialog nicht lahmlegen.
    return null;
  }
}

function ankerSchreiben(a: Anker | null) {
  try {
    if (a) localStorage.setItem(ANKER_KEY, JSON.stringify(a));
    else localStorage.removeItem(ANKER_KEY);
  } catch { /* privater Modus o. Ae. — dann eben ohne Anker */ }
}

function Zielordner({
  gewaehlt, vorbelegt, onWaehlen,
}: {
  gewaehlt: { id: string; path: string } | null;
  vorbelegt: boolean;
  onWaehlen: (id: string, path: string) => void;
}) {
  const { toast } = useToast();
  const [anker, setAnker] = useState<Anker | null>(() => ankerLesen());

  // Der Baum startet beim Anker, wenn einer gesetzt ist. Die Wurzel bleibt
  // als unterste Stufe im Stapel — dadurch fuehrt die Brotkrume immer
  // zurueck zum ganzen OneDrive.
  const [stack, setStack] = useState<{ id: string; name: string }[]>(() => {
    const a = ankerLesen();
    return a
      ? [{ id: 'root', name: 'OneDrive' }, { id: a.id, name: a.name }]
      : [{ id: 'root', name: 'OneDrive' }];
  });

  const [neuerName, setNeuerName] = useState('');
  const [legeAn, setLegeAn] = useState(false);
  const [busy, setBusy] = useState(false);

  const current = stack[stack.length - 1];
  const pfad = stack.slice(1).map((x) => x.name).join(' / ');
  const imAnker = !!anker && current.id === anker.id;

  const { data, isLoading, refetch, error } = useQuery({
    queryKey: ['onedrive-ziel', current.id],
    queryFn: () => onedrive<{ folders: OneDriveFolder[] }>('listFolders', { parentId: current.id }),
  });

  // Anker zeigt ins Leere (Ordner in OneDrive geloescht): zurueck zur
  // Wurzel, statt eine leere Liste ohne Erklaerung zu zeigen.
  useEffect(() => {
    if (!error || !imAnker) return;
    setStack([{ id: 'root', name: 'OneDrive' }]);
    setAnker(null);
    ankerSchreiben(null);
    toast({
      title: 'Startordner nicht mehr vorhanden',
      description: 'Der gemerkte Ordner existiert in OneDrive nicht mehr. Der Baum beginnt wieder ganz oben.',
    });
  }, [error, imAnker, toast]);

  /** Springt zu einer Stufe der Brotkrume — 0 ist die OneDrive-Wurzel. */
  const springeZu = (index: number) => setStack((s) => s.slice(0, index + 1));

  const ankerSetzen = () => {
    if (stack.length === 1) return; // die Wurzel als Anker waere sinnlos
    const neu: Anker = { id: current.id, name: current.name, path: pfad };
    setAnker(neu);
    ankerSchreiben(neu);
    toast({ title: 'Startordner gemerkt', description: pfad });
  };

  const ankerLoesen = () => {
    setAnker(null);
    ankerSchreiben(null);
    toast({ title: 'Startordner aufgehoben', description: 'Der Baum beginnt wieder bei OneDrive.' });
  };

  const anlegen = async () => {
    const name = neuerName.trim();
    if (!name) return;
    if (/[/\\:*?"<>|]/.test(name)) {
      toast({ title: 'Ungültiger Name', description: 'Ohne / \\ : * ? " < > |', variant: 'destructive' });
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
        {/* Brotkrume: jede Stufe anklickbar. „OneDrive" ganz links fuehrt
            immer zum ganzen Baum zurueck — der Anker ist ein Startpunkt,
            keine Sperre. */}
        <div className="flex items-center gap-1.5 border-b px-2.5 py-2">
          {stack.length > 1 && (
            <button onClick={() => setStack((s) => s.slice(0, -1))}
              className="shrink-0" aria-label="Eine Ebene zurück">
              <ArrowLeft className="h-4 w-4 text-muted-foreground hover:text-foreground" />
            </button>
          )}

          <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto font-mono text-xs">
            {stack.map((s, i) => (
              <React.Fragment key={`${s.id}-${i}`}>
                {i > 0 && <span className="shrink-0 text-muted-foreground/50">/</span>}
                <button
                  onClick={() => springeZu(i)}
                  disabled={i === stack.length - 1}
                  className={`shrink-0 rounded px-1 py-0.5 ${
                    i === stack.length - 1
                      ? 'font-medium text-foreground'
                      : 'text-muted-foreground hover:bg-muted hover:text-foreground'}`}
                >
                  {s.name}
                </button>
              </React.Fragment>
            ))}
          </div>

          {/* Anker: aktueller Ordner wird Startpunkt. Im Ankerordner selbst
              wird das Symbol zum Aufheben. */}
          {stack.length > 1 && (
            imAnker ? (
              <button onClick={ankerLoesen} className="shrink-0" title="Startordner aufheben">
                <Anchor className="h-4 w-4 text-primary" />
              </button>
            ) : (
              <button onClick={ankerSetzen} className="shrink-0"
                title="Diesen Ordner als Startordner merken">
                <Anchor className="h-4 w-4 text-muted-foreground/50 hover:text-primary" />
              </button>
            )
          )}

          <button onClick={() => setLegeAn((v) => !v)} className="shrink-0"
            aria-label="Ordner hier anlegen">
            <FolderPlus className="h-4 w-4 text-muted-foreground hover:text-primary" />
          </button>
        </div>

        {anker && !imAnker && (
          <button
            onClick={() => setStack([{ id: 'root', name: 'OneDrive' }, { id: anker.id, name: anker.name }])}
            className="flex w-full items-center gap-1.5 border-b bg-primary/5 px-2.5 py-1.5 text-left text-xs text-primary hover:bg-primary/10"
          >
            <Anchor className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">Zurück zum Startordner: {anker.path || anker.name}</span>
          </button>
        )}

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
