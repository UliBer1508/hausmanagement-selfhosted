import React, { useState, useMemo } from 'react';
import { Plus, Pencil, Trash2, Folder, FolderPlus, ArrowLeft, Loader2, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useQuery } from '@tanstack/react-query';
import {
  onedrive, useDocumentTypes, useSaveDocumentType, useVendors, useSaveVendor,
  useDeleteVendor, useLocations, useSaveLocation, useDeleteLocation,
  INVALID_FOLDER_CHARS,
  type DocumentType, type DocumentVendor, type LinkTarget, type OneDriveFolder,
} from '@/hooks/useDocuments';

const COLORS: Record<string, string> = {
  emerald: 'bg-emerald-100 text-emerald-900',
  violet: 'bg-violet-100 text-violet-900',
  amber: 'bg-amber-100 text-amber-900',
  sky: 'bg-sky-100 text-sky-900',
  rose: 'bg-rose-100 text-rose-900',
  slate: 'bg-slate-100 text-slate-700',
};

const ART_LABEL: Record<string, string> = {
  haus: 'Haus', provider: 'Dienstleister', vendor: 'Absender',
  buchung: 'Buchung', reinigung: 'Reinigung', waesche: 'Wäschelieferung',
};

/** Objekte, die einen eigenen Ablageort haben koennen. */
interface Objekt { art: LinkTarget; id: string; name: string; }

/**
 * DocumentSettings — drei Bereiche in einem Dialog.
 *
 * Dokumenttypen  Name und Unterordnername, frei anlegbar.
 * Absender       Rechnungsabsender ohne eigenes Objekt im System.
 * Ablageorte     Der festgelegte Ordner je Objekt UND Dokumenttyp.
 *
 * Der Ablageort wird NICHT abgeleitet. Er entsteht entweder hier oder
 * beim ersten Ablegen und wird dann wiederverwendet.
 */
export default function DocumentSettings({ onClose }: { onClose: () => void }) {
  const [tab, setTab] = useState<'typen' | 'absender' | 'ablage'>('typen');

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Dokumentenverwaltung · Einstellungen</DialogTitle>
          <DialogDescription>Typen, Absender und Ablageorte.</DialogDescription>
        </DialogHeader>

        <div className="flex gap-1 border-b">
          {([
            ['typen', 'Dokumenttypen'],
            ['absender', 'Absender'],
            ['ablage', 'Ablageorte'],
          ] as const).map(([key, label]) => (
            <button key={key} onClick={() => setTab(key)}
              className={`px-3.5 py-2 text-sm ${tab === key
                ? 'border-b-2 border-primary font-medium text-primary'
                : 'text-muted-foreground hover:text-foreground'}`}>
              {label}
            </button>
          ))}
        </div>

        {tab === 'typen' && <TypenBereich />}
        {tab === 'absender' && <AbsenderBereich />}
        {tab === 'ablage' && <AblageBereich />}
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------------------------------------ Dokumenttypen */

function TypenBereich() {
  const { toast } = useToast();
  const { data: types = [] } = useDocumentTypes(true);
  const save = useSaveDocumentType();
  const [edit, setEdit] = useState<Partial<DocumentType> | null>(null);
  const [err, setErr] = useState('');

  const blank: Partial<DocumentType> = {
    name: '', folder_name: '', color: 'emerald', is_active: true, sort_order: 100,
  };

  const submit = () => {
    save.mutate(edit as any, {
      onSuccess: () => {
        toast({ title: edit?.id ? 'Typ geändert' : 'Typ angelegt' });
        setEdit(null); setErr('');
      },
      onError: (e: any) => setErr(e.message),
    });
  };

  return (
    <div className="space-y-3">
      <div className="overflow-hidden rounded-lg border">
        {types.length === 0 && (
          <p className="px-3 py-6 text-center text-sm text-muted-foreground">Noch keine Typen.</p>
        )}
        {types.map((t) => (
          <div key={t.id} className="flex items-center gap-3 border-t px-3 py-2.5 first:border-t-0">
            <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${(COLORS[t.color] ?? COLORS.slate).split(' ')[0]}`} />
            <div className="min-w-0 flex-1">
              <p className={`truncate text-sm ${t.is_active ? '' : 'text-muted-foreground line-through'}`}>{t.name}</p>
              <p className="truncate font-mono text-xs text-muted-foreground">Ordner: {t.folder_name}</p>
            </div>
            <button onClick={() => { setEdit({ ...t }); setErr(''); }} aria-label={`${t.name} bearbeiten`}>
              <Pencil className="h-4 w-4 text-muted-foreground hover:text-primary" />
            </button>
          </div>
        ))}
      </div>

      {!edit ? (
        <Button onClick={() => { setEdit(blank); setErr(''); }}>
          <Plus className="mr-2 h-4 w-4" /> Neuer Dokumenttyp
        </Button>
      ) : (
        <div className="space-y-3 rounded-lg border bg-muted/40 p-4">
          <p className="text-sm font-semibold">{edit.id ? 'Typ bearbeiten' : 'Neuer Typ'}</p>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label>Name</Label>
              <Input value={edit.name ?? ''} placeholder="z. B. Rechnungen"
                onChange={(e) => {
                  const name = e.target.value;
                  // Ordnername folgt dem Namen, solange er nicht selbst gesetzt wurde
                  setEdit((p) => ({
                    ...p, name,
                    folder_name: !p?.id && (!p?.folder_name || p.folder_name === p.name) ? name : p?.folder_name,
                  }));
                  setErr('');
                }} />
            </div>
            <div>
              <Label>Ordnername in OneDrive</Label>
              <Input className="font-mono" value={edit.folder_name ?? ''} placeholder="z. B. Rechnungen"
                onChange={(e) => { setEdit({ ...edit, folder_name: e.target.value }); setErr(''); }} />
              <p className="mt-1 text-xs text-muted-foreground">
                Unterordner unter dem Objektordner. Ohne / \ : * ? " &lt; &gt; |
              </p>
            </div>
          </div>

          <div>
            <Label>Farbe</Label>
            <div className="mt-1 flex gap-2">
              {Object.keys(COLORS).map((c) => (
                <button key={c} onClick={() => setEdit({ ...edit, color: c })}
                  className={`h-7 w-7 rounded-full ${COLORS[c].split(' ')[0]} ${edit.color === c ? 'ring-2 ring-foreground ring-offset-2' : ''}`}
                  aria-label={`Farbe ${c}`} />
              ))}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <input id="typ-aktiv" type="checkbox" checked={edit.is_active ?? true}
              onChange={(e) => setEdit({ ...edit, is_active: e.target.checked })} />
            <Label htmlFor="typ-aktiv" className="font-normal">
              Aktiv — deaktivierte Typen verschwinden aus der Auswahl, bleiben aber an bestehenden Dokumenten lesbar.
            </Label>
          </div>

          {err && <p className="text-sm text-destructive">{err}</p>}

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => { setEdit(null); setErr(''); }}>Abbrechen</Button>
            <Button onClick={submit} disabled={save.isPending}>
              {save.isPending ? 'Wird gespeichert…' : 'Speichern'}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------- Absender */

function AbsenderBereich() {
  const { toast } = useToast();
  const { data: vendors = [] } = useVendors(true);
  const save = useSaveVendor();
  const del = useDeleteVendor();
  const [edit, setEdit] = useState<Partial<DocumentVendor> | null>(null);
  const [err, setErr] = useState('');

  const submit = () => {
    save.mutate(edit as any, {
      onSuccess: () => {
        toast({ title: edit?.id ? 'Absender geändert' : 'Absender angelegt' });
        setEdit(null); setErr('');
      },
      onError: (e: any) => setErr(e.message),
    });
  };

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Rechnungsabsender ohne eigenes Objekt im System — Gemeinde, Energieversorger,
        Handwerker. Dienstleister und Häuser stehen nicht hier, die kommen aus dem System.
      </p>

      <div className="overflow-hidden rounded-lg border">
        {vendors.length === 0 && (
          <p className="px-3 py-6 text-center text-sm text-muted-foreground">Noch keine Absender.</p>
        )}
        {vendors.map((v) => (
          <div key={v.id} className="flex items-center gap-3 border-t px-3 py-2.5 first:border-t-0">
            <div className="min-w-0 flex-1">
              <p className={`truncate text-sm ${v.is_active ? '' : 'text-muted-foreground line-through'}`}>{v.name}</p>
              {v.note && <p className="truncate text-xs text-muted-foreground">{v.note}</p>}
            </div>
            <button onClick={() => { setEdit({ ...v }); setErr(''); }} aria-label={`${v.name} bearbeiten`}>
              <Pencil className="h-4 w-4 text-muted-foreground hover:text-primary" />
            </button>
            <button aria-label={`${v.name} löschen`}
              onClick={() => del.mutate(v.id, {
                onSuccess: () => toast({ title: 'Absender gelöscht' }),
                onError: (e: any) => toast({ title: 'Fehler', description: e.message, variant: 'destructive' }),
              })}>
              <Trash2 className="h-4 w-4 text-muted-foreground hover:text-destructive" />
            </button>
          </div>
        ))}
      </div>

      {!edit ? (
        <Button onClick={() => { setEdit({ name: '', note: '', is_active: true }); setErr(''); }}>
          <Plus className="mr-2 h-4 w-4" /> Neuer Absender
        </Button>
      ) : (
        <div className="space-y-3 rounded-lg border bg-muted/40 p-4">
          <p className="text-sm font-semibold">{edit.id ? 'Absender bearbeiten' : 'Neuer Absender'}</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label>Name</Label>
              <Input value={edit.name ?? ''} placeholder="z. B. Gemeinde Neukirchen"
                onChange={(e) => { setEdit({ ...edit, name: e.target.value }); setErr(''); }} />
            </div>
            <div>
              <Label>Notiz <span className="font-normal text-muted-foreground">optional</span></Label>
              <Input value={edit.note ?? ''} placeholder="z. B. Kurtaxe, Wasser"
                onChange={(e) => setEdit({ ...edit, note: e.target.value })} />
            </div>
          </div>

          {err && <p className="text-sm text-destructive">{err}</p>}

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => { setEdit(null); setErr(''); }}>Abbrechen</Button>
            <Button onClick={submit} disabled={save.isPending}>
              {save.isPending ? 'Wird gespeichert…' : 'Speichern'}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

/* -------------------------------------------------------------- Ablageorte */

function AblageBereich() {
  const { toast } = useToast();
  const { data: types = [] } = useDocumentTypes(true);
  const { data: vendors = [] } = useVendors(true);
  const { data: locations = [], isLoading } = useLocations();
  const saveLoc = useSaveLocation();
  const delLoc = useDeleteLocation();

  const [neu, setNeu] = useState<{ objekt: Objekt; typId: string } | null>(null);

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

  const objekte: Objekt[] = useMemo(() => [
    ...(houses as any[]).map((h) => ({ art: 'haus' as LinkTarget, id: h.id, name: h.name })),
    ...(providers as any[]).map((p) => ({ art: 'provider' as LinkTarget, id: p.id, name: p.name })),
    ...vendors.map((v) => ({ art: 'vendor' as LinkTarget, id: v.id, name: v.name })),
  ], [houses, providers, vendors]);

  const nameOf = (art: string, id: string) =>
    objekte.find((o) => o.art === art && o.id === id)?.name ?? 'unbekannt';
  const typeName = (id: string) => types.find((t) => t.id === id)?.name ?? 'unbekannt';

  if (neu) {
    return (
      <OrdnerWaehlen
        titel={`${neu.objekt.name} · ${typeName(neu.typId)}`}
        onAbbrechen={() => setNeu(null)}
        onWaehlen={(itemId, path) =>
          saveLoc.mutate(
            { entityType: neu.objekt.art, entityId: neu.objekt.id, documentTypeId: neu.typId, itemId, path },
            {
              onSuccess: () => { toast({ title: 'Ablageort gespeichert', description: path }); setNeu(null); },
              onError: (e: any) => toast({ title: 'Fehler', description: e.message, variant: 'destructive' }),
            },
          )}
      />
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Der festgelegte Ordner je Objekt und Dokumenttyp. Ein Eintrag entsteht hier
        oder beim ersten Ablegen und wird danach wiederverwendet.
      </p>

      {isLoading ? (
        <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
      ) : (
        <div className="overflow-hidden rounded-lg border">
          {locations.length === 0 && (
            <p className="px-3 py-6 text-center text-sm text-muted-foreground">
              Noch keine Ablageorte festgelegt.
            </p>
          )}
          {locations.map((l) => (
            <div key={l.id} className="flex items-center gap-3 border-t px-3 py-2.5 first:border-t-0">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm">
                  {nameOf(l.entity_type, l.entity_id)}
                  <span className="ml-2 rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
                    {ART_LABEL[l.entity_type] ?? l.entity_type}
                  </span>
                  <span className="ml-2 text-muted-foreground">· {typeName(l.document_type_id)}</span>
                </p>
                <p className="truncate font-mono text-xs text-muted-foreground">{l.onedrive_path ?? '—'}</p>
              </div>
              <button aria-label="Ablageort ändern"
                onClick={() => {
                  const o = objekte.find((x) => x.art === l.entity_type && x.id === l.entity_id);
                  if (o) setNeu({ objekt: o, typId: l.document_type_id });
                }}>
                <Pencil className="h-4 w-4 text-muted-foreground hover:text-primary" />
              </button>
              <button aria-label="Ablageort entfernen"
                onClick={() => delLoc.mutate(l.id, {
                  onSuccess: () => toast({ title: 'Ablageort entfernt' }),
                  onError: (e: any) => toast({ title: 'Fehler', description: e.message, variant: 'destructive' }),
                })}>
                <Trash2 className="h-4 w-4 text-muted-foreground hover:text-destructive" />
              </button>
            </div>
          ))}
        </div>
      )}

      <NeuerAblageort objekte={objekte} types={types} onStart={(o, t) => setNeu({ objekt: o, typId: t })} />
    </div>
  );
}

function NeuerAblageort({
  objekte, types, onStart,
}: { objekte: Objekt[]; types: DocumentType[]; onStart: (o: Objekt, typId: string) => void }) {
  const [offen, setOffen] = useState(false);
  const [objKey, setObjKey] = useState('');
  const [typId, setTypId] = useState('');

  if (!offen) {
    return (
      <Button onClick={() => setOffen(true)}>
        <Plus className="mr-2 h-4 w-4" /> Ablageort festlegen
      </Button>
    );
  }

  const objekt = objekte.find((o) => `${o.art}:${o.id}` === objKey);

  return (
    <div className="space-y-3 rounded-lg border bg-muted/40 p-4">
      <p className="text-sm font-semibold">Ablageort festlegen</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <Label>Objekt</Label>
          <select value={objKey} onChange={(e) => setObjKey(e.target.value)}
            className="h-9 w-full rounded-md border bg-background px-2.5 text-sm">
            <option value="">Objekt wählen…</option>
            {(['provider', 'haus', 'vendor'] as LinkTarget[]).map((art) => {
              const gruppe = objekte.filter((o) => o.art === art);
              if (gruppe.length === 0) return null;
              return (
                <optgroup key={art} label={ART_LABEL[art]}>
                  {gruppe.map((o) => (
                    <option key={`${o.art}:${o.id}`} value={`${o.art}:${o.id}`}>{o.name}</option>
                  ))}
                </optgroup>
              );
            })}
          </select>
        </div>
        <div>
          <Label>Dokumenttyp</Label>
          <select value={typId} onChange={(e) => setTypId(e.target.value)}
            className="h-9 w-full rounded-md border bg-background px-2.5 text-sm">
            <option value="">Typ wählen…</option>
            {types.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </div>
      </div>

      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={() => setOffen(false)}>Abbrechen</Button>
        <Button disabled={!objekt || !typId}
          onClick={() => { if (objekt && typId) { onStart(objekt, typId); setOffen(false); setObjKey(''); setTypId(''); } }}>
          Ordner wählen
        </Button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------- Ordnerbaum */

/**
 * Ordnerbaum zum Waehlen und Anlegen.
 *
 * Der Pfad wird aus dem Klickweg aufgebaut, NICHT aus itemInfo: die
 * Aktion liefert bei einem Ordner den Pfad des ELTERNordners, nicht den
 * eigenen. Aus dem Baum ist er zuverlaessig.
 */
export function OrdnerWaehlen({
  titel, onWaehlen, onAbbrechen,
}: { titel: string; onWaehlen: (itemId: string, path: string) => void; onAbbrechen: () => void }) {
  const { toast } = useToast();
  const [stack, setStack] = useState<{ id: string; name: string }[]>([{ id: 'root', name: 'OneDrive' }]);
  const [neuerName, setNeuerName] = useState('');
  const [legeAn, setLegeAn] = useState(false);
  const [busy, setBusy] = useState(false);

  const current = stack[stack.length - 1];
  const pfad = stack.slice(1).map((s) => s.name).join(' / ');

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['onedrive-tree', current.id],
    queryFn: () => onedrive<{ folders: OneDriveFolder[] }>('listFolders', { parentId: current.id }),
  });

  const anlegen = async () => {
    const name = neuerName.trim();
    if (!name) return;
    if (INVALID_FOLDER_CHARS.test(name)) {
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
      // Microsoft kann bei Namenskonflikt umbenennen — created.name gilt.
      setStack((s) => [...s, { id: created.id, name: created.name }]);
    } catch (e: any) {
      toast({ title: 'Ordner nicht angelegt', description: e.message, variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3">
      <div>
        <p className="text-sm font-semibold">Ordner für {titel}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Ordner öffnen mit dem Pfeil, wählen mit dem Haken. Fehlt einer, hier anlegen.
        </p>
      </div>

      <div className="rounded-lg border">
        <div className="flex items-center gap-2 border-b px-2.5 py-2">
          {stack.length > 1 && (
            <button onClick={() => setStack((s) => s.slice(0, -1))} aria-label="Eine Ebene zurück">
              <ArrowLeft className="h-4 w-4 text-muted-foreground" />
            </button>
          )}
          <span className="min-w-0 flex-1 truncate font-mono text-xs text-muted-foreground">
            {pfad || 'OneDrive'}
          </span>
          <button onClick={() => setLegeAn((v) => !v)} aria-label="Unterordner anlegen">
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

        <div className="max-h-64 overflow-y-auto p-1.5">
          {isLoading && (
            <div className="flex justify-center py-6"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /></div>
          )}
          {data?.folders.map((f) => (
            <div key={f.id} className="flex items-center gap-1 rounded hover:bg-muted">
              <span className="flex min-w-0 flex-1 items-center gap-2 px-2 py-1.5 text-sm">
                <Folder className="h-4 w-4 shrink-0 text-muted-foreground" />
                <span className="truncate">{f.name}</span>
              </span>
              <button className="px-2 py-1.5" aria-label={`${f.name} wählen`}
                onClick={() => onWaehlen(f.id, [pfad, f.name].filter(Boolean).join(' / '))}>
                <Check className="h-4 w-4 text-muted-foreground hover:text-primary" />
              </button>
              <button className="px-2 py-1.5" aria-label={`${f.name} öffnen`}
                onClick={() => setStack((s) => [...s, { id: f.id, name: f.name }])}>
                <span className="text-muted-foreground">›</span>
              </button>
            </div>
          ))}
          {data && data.folders.length === 0 && (
            <p className="px-2 py-4 text-center text-xs text-muted-foreground">Keine Unterordner.</p>
          )}
        </div>
      </div>

      <div className="flex justify-between gap-2">
        <Button variant="outline" onClick={onAbbrechen}>Abbrechen</Button>
        {stack.length > 1 && (
          <Button onClick={() => onWaehlen(current.id, pfad)}>
            Diesen Ordner nehmen
          </Button>
        )}
      </div>
    </div>
  );
}
