import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  RefreshCw,
  Loader2,
  Workflow,
  Pencil,
  Save,
  X,
  ShieldCheck,
  ShieldAlert,
  Minus,
  SearchCheck,
} from 'lucide-react';

interface MaxAblaeufePanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface Ablauf {
  id: string;
  aktion: string;
  aktion_label: string | null;
  ausloeser: string | null;
  variante: string | null;
  schritt_nr: number | null;
  akteur: string | null;
  schritt: string | null;
  ergebnis_status: string | null;
  karte: string | null;
  umsetzung: string | null;
  weg: string | null;   // wie der Schritt laeuft: 'ki' | 'system' | 'mensch' (Definition, read-only)
  notiz: string | null;
  funktion: string | null;
  created_at: string;
  updated_at: string;
  // Prüfbefund (14.07.2026) — wird von der Edge Function max-ablaeufe-pruefen
  // geschrieben, NICHT von Hand. Das ist der Unterschied zu `umsetzung`:
  //   umsetzung       = was Uli WILL  (eine Absicht)
  //   geprueft_status = was WIRKLICH da ist (ein Befund)
  geprueft_am: string | null;
  geprueft_status: string | null;   // 'ok' | 'fehler' | 'kein_code'
  geprueft_befund: string | null;
}

// NUR diese beiden Felder sind unsere eigenen Pflege-/Kontrollfelder und
// dürfen hier geändert werden. Alles andere beschreibt, wie Max im Code
// arbeitet (Definition) und bleibt read-only.
const UMSETZUNG_OPTIONS = ['umgesetzt', 'vorbereitet', 'pruefen', 'luecke', 'fehlt'];

const UMSETZUNG_STYLE: Record<string, string> = {
  umgesetzt: 'bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-900/40 dark:text-emerald-200',
  vorbereitet: 'bg-blue-100 text-blue-800 border-blue-300 dark:bg-blue-900/40 dark:text-blue-200',
  pruefen: 'bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-900/40 dark:text-amber-200',
  luecke: 'bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-900/40 dark:text-amber-200',
  fehlt: 'bg-destructive/10 text-destructive border-destructive/30',
};

// Wie der Schritt technisch laeuft (Spalte `weg`, Definition, read-only):
//   ki     = Max/Gemini interpretiert + waehlt die Funktion selbst
//   system = Cron / DB-Trigger (ohne Chat)
//   mensch = reiner Handlungsschritt einer Person
const WEG_STYLE: Record<string, string> = {
  ki: 'bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-200',
  system: 'bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-200',
  mensch: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200',
};

// Farben je Akteur. Unbekannte Werte fallen auf Grau zurueck (siehe ?? unten),
// die Anzeige bricht also nie — sie wird nur unspezifisch.
//
// 'provider' (22.07.2026): Die Reinigungsablaeufe sind providerneutral
// beschrieben, seit Boris dazugekommen ist. Wo frueher fest 'amela' stand, steht
// jetzt 'provider' — denn der Code arbeitet ueber service_tasks.provider_id und
// kennt keine feste Zuordnung. Amela, Boris und Teuni bleiben zusaetzlich
// gelistet, weil sie an einzelnen Stellen noch namentlich vorkommen.
const AKTEUR_STYLE: Record<string, string> = {
  uli: 'bg-primary/10 text-primary',
  max: 'bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-200',
  system: 'bg-muted text-muted-foreground',
  provider: 'bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-200',
  amela: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-200',
  boris: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/40 dark:text-indigo-200',
  teuni: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200',
  gast: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200',
};

const MaxAblaeufePanel = ({ open, onOpenChange }: MaxAblaeufePanelProps) => {
  const [aktionFilter, setAktionFilter] = useState<string>('all');
  const [umsetzungFilter, setUmsetzungFilter] = useState<string>('all');
  const [savingId, setSavingId] = useState<string | null>(null);
  const [pruefeLaeuft, setPruefeLaeuft] = useState(false);
  const [pruefErgebnis, setPruefErgebnis] = useState<string | null>(null);

  /**
   * Prüft die Tabelle gegen den WIRKLICHEN Code.
   *
   * Bis 14.07.2026 war `umsetzung` eine reine Behauptung: Uli klickte
   * "umgesetzt", und niemand prüfte nach. Diese Funktion ruft die Edge Function
   * max-ablaeufe-pruefen auf, die jeden in `funktion` genannten Baustein
   * (Tool / Edge Function / DB-Trigger) gegen die Wirklichkeit abgleicht und
   * das Ergebnis in geprueft_status/geprueft_befund schreibt.
   */
  const pruefen = async () => {
    setPruefeLaeuft(true);
    setPruefErgebnis(null);
    try {
      const { data, error } = await supabase.functions.invoke('max-ablaeufe-pruefen');
      if (error) throw error;
      const fehler = data?.fehler ?? 0;
      const ok = data?.ok ?? 0;
      setPruefErgebnis(
        fehler > 0
          ? `${fehler} Abweichung(en) gefunden — ${ok} Schritte in Ordnung.`
          : `Alles stimmt: ${ok} Schritte geprüft, keine Abweichung.`,
      );
      await refetch();
    } catch (e) {
      console.error('[MaxAblaeufePanel] Prüfung fehlgeschlagen', e);
      setPruefErgebnis('Die Prüfung konnte nicht ausgeführt werden.');
    } finally {
      setPruefeLaeuft(false);
    }
  };
  const [editNotizId, setEditNotizId] = useState<string | null>(null);
  const [notizDraft, setNotizDraft] = useState<string>('');
  const [actionError, setActionError] = useState<string | null>(null);

  const {
    data: rows = [],
    isLoading,
    isFetching,
    refetch,
    error,
  } = useQuery({
    queryKey: ['max_ablaeufe'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('max_ablaeufe')
        .select('*')
        .order('aktion', { ascending: true })
        .order('variante', { ascending: true })
        .order('schritt_nr', { ascending: true });
      if (error) throw error;
      return (data ?? []) as Ablauf[];
    },
    enabled: open,
  });

  const aktionen = Array.from(
    new Map(rows.map((r) => [r.aktion, r.aktion_label || r.aktion])).entries(),
  ).sort((a, b) => a[1].localeCompare(b[1]));

  const filtered = rows.filter((r) => {
    if (aktionFilter !== 'all' && r.aktion !== aktionFilter) return false;
    if (umsetzungFilter !== 'all' && (r.umsetzung || '') !== umsetzungFilter) return false;
    return true;
  });

  // Nach Ablauf gruppieren (Query ist bereits sortiert).
  const groups: { aktion: string; label: string; ausloeser: string | null; steps: Ablauf[] }[] = [];
  for (const r of filtered) {
    let g = groups.find((x) => x.aktion === r.aktion);
    if (!g) {
      g = { aktion: r.aktion, label: r.aktion_label || r.aktion, ausloeser: r.ausloeser, steps: [] };
      groups.push(g);
    }
    if (!g.ausloeser && r.ausloeser) g.ausloeser = r.ausloeser;
    g.steps.push(r);
  }

  // Umsetzungsstand ändern (speichert sofort).
  const changeUmsetzung = async (id: string, value: string) => {
    setActionError(null);
    setSavingId(id);
    const { error: updErr } = await supabase
      .from('max_ablaeufe')
      .update({ umsetzung: value, updated_at: new Date().toISOString() })
      .eq('id', id);
    setSavingId(null);
    if (updErr) {
      setActionError(`Speichern fehlgeschlagen: ${updErr.message}`);
      return;
    }
    await refetch();
  };

  // Notiz bearbeiten.
  const startNotiz = (r: Ablauf) => {
    setActionError(null);
    setEditNotizId(r.id);
    setNotizDraft(r.notiz ?? '');
  };
  const cancelNotiz = () => {
    setEditNotizId(null);
    setNotizDraft('');
  };
  const saveNotiz = async (id: string) => {
    setActionError(null);
    setSavingId(id);
    const { error: updErr } = await supabase
      .from('max_ablaeufe')
      .update({ notiz: notizDraft.trim() === '' ? null : notizDraft, updated_at: new Date().toISOString() })
      .eq('id', id);
    setSavingId(null);
    if (updErr) {
      setActionError(`Speichern fehlgeschlagen: ${updErr.message}`);
      return;
    }
    cancelNotiz();
    await refetch();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[88vh] flex flex-col z-[200]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Workflow className="h-5 w-5 text-primary" />
            Max: Abläufe (Kontrolle)
            <Badge variant="outline" className="ml-1">
              {rows.length}
            </Badge>
          </DialogTitle>
          <DialogDescription>
            Übersicht aller Max-Abläufe Schritt für Schritt — zur Kontrolle. Änderbar sind nur
            die Pflegefelder <strong>Umsetzung</strong> und <strong>Notiz</strong>; die
            Ablauf-Definition selbst spiegelt den Code und ist schreibgeschützt.
          </DialogDescription>
        </DialogHeader>

        {/* Filter + Aktualisieren + Legende */}
        <div className="flex flex-wrap items-center gap-2">
          <Select value={aktionFilter} onValueChange={setAktionFilter}>
            <SelectTrigger className="w-[240px]">
              <SelectValue placeholder="Ablauf" />
            </SelectTrigger>
            <SelectContent className="z-[210]">
              <SelectItem value="all">Alle Abläufe</SelectItem>
              {aktionen.map(([key, label]) => (
                <SelectItem key={key} value={key}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={umsetzungFilter} onValueChange={setUmsetzungFilter}>
            <SelectTrigger className="w-[170px]">
              <SelectValue placeholder="Umsetzung" />
            </SelectTrigger>
            <SelectContent className="z-[210]">
              <SelectItem value="all">Alle Stände</SelectItem>
              {UMSETZUNG_OPTIONS.map((u) => (
                <SelectItem key={u} value={u}>
                  {u}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Button
            size="sm"
            variant="default"
            onClick={pruefen}
            disabled={pruefeLaeuft}
            title="Prüft jeden Schritt gegen den wirklichen Code — statt zu glauben, was hier steht"
          >
            {pruefeLaeuft ? (
              <Loader2 className="mr-1 h-4 w-4 animate-spin" />
            ) : (
              <SearchCheck className="mr-1 h-4 w-4" />
            )}
            Gegen Code prüfen
          </Button>

          <Button variant="ghost" size="icon" onClick={() => refetch()} title="Aktualisieren">
            <RefreshCw className={`h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} />
          </Button>

          {pruefErgebnis && (
            <span
              className={`ml-2 text-xs ${
                pruefErgebnis.includes('Abweichung(en)')
                  ? 'text-red-600 dark:text-red-400'
                  : 'text-emerald-600 dark:text-emerald-400'
              }`}
            >
              {pruefErgebnis}
            </span>
          )}

          <div className="ml-auto flex items-center gap-2 text-[11px] text-muted-foreground">
            <span className="inline-flex items-center rounded px-1.5 py-0.5 border bg-emerald-100 text-emerald-800 border-emerald-300">umgesetzt</span>
            <span className="inline-flex items-center rounded px-1.5 py-0.5 border bg-amber-100 text-amber-800 border-amber-300">lücke/prüfen</span>
            <span className="inline-flex items-center rounded px-1.5 py-0.5 border bg-destructive/10 text-destructive border-destructive/30">fehlt</span>
          </div>
        </div>

        {actionError && (
          <div className="bg-destructive/10 text-destructive p-2 rounded text-xs">{actionError}</div>
        )}

        {/* Inhalt */}
        <div className="flex-1 overflow-y-auto min-h-0 space-y-5 pr-1">
          {isLoading ? (
            <div className="flex items-center justify-center py-10 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin mr-2" />
              Lade Abläufe…
            </div>
          ) : error ? (
            <div className="bg-destructive/10 text-destructive p-3 rounded text-sm">
              Fehler beim Laden: {(error as Error).message}
            </div>
          ) : groups.length === 0 ? (
            <div className="text-center py-10 text-muted-foreground text-sm">
              Keine Abläufe für diese Auswahl.
            </div>
          ) : (
            groups.map((g) => (
              <div key={g.aktion} className="border rounded-lg overflow-hidden">
                {/* Ablauf-Kopf */}
                <div className="bg-muted/60 px-3 py-2 border-b">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-sm">{g.label}</span>
                    <code className="text-[11px] text-muted-foreground">{g.aktion}</code>
                  </div>
                  {g.ausloeser && (
                    <p className="text-xs text-muted-foreground mt-0.5">Auslöser: {g.ausloeser}</p>
                  )}
                </div>

                {/* Spaltenkopf (Desktop) */}
                <div className="hidden md:grid grid-cols-[3rem_5rem_1fr_7rem_8rem_1fr] gap-2 px-3 py-1.5 text-[11px] uppercase tracking-wide text-muted-foreground border-b bg-background">
                  <div>Nr · Var.</div>
                  <div>Akteur</div>
                  <div>Schritt</div>
                  <div>Ergebnis</div>
                  <div>Umsetzung</div>
                  <div>Funktion / Notiz</div>
                </div>

                {/* Schritte (read-only, außer Umsetzung + Notiz) */}
                <div className="divide-y">
                  {g.steps.map((r) => (
                    <div
                      key={r.id}
                      className="grid grid-cols-1 md:grid-cols-[3rem_5rem_1fr_7rem_8rem_1fr] gap-2 px-3 py-2 text-sm items-start"
                    >
                      <div className="text-muted-foreground text-xs">
                        <span className="font-medium text-foreground">{r.schritt_nr ?? '–'}</span>
                        {r.variante && r.variante !== 'standard' && (
                          <span className="block text-[10px]">{r.variante}</span>
                        )}
                      </div>
                      <div className="flex flex-col items-start">
                        {r.akteur && (
                          <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-[11px] ${AKTEUR_STYLE[r.akteur] ?? 'bg-muted text-muted-foreground'}`}>
                            {r.akteur}
                          </span>
                        )}
                        {r.weg && (
                          <span className={`mt-1 inline-flex items-center rounded px-1.5 py-0.5 text-[10px] ${WEG_STYLE[r.weg] ?? 'bg-muted text-muted-foreground'}`}>
                            {r.weg}
                          </span>
                        )}
                      </div>
                      <div className="whitespace-pre-wrap">{r.schritt}</div>
                      <div className="text-xs">
                        {r.ergebnis_status ? (
                          <span className="text-muted-foreground">{r.ergebnis_status}</span>
                        ) : (
                          <span className="text-muted-foreground/50">—</span>
                        )}
                      </div>

                      {/* Umsetzung — änderbar (speichert sofort) */}
                      <div className="flex items-center gap-1">
                        <Select
                          value={r.umsetzung ?? ''}
                          onValueChange={(v) => changeUmsetzung(r.id, v)}
                          disabled={savingId === r.id}
                        >
                          <SelectTrigger
                            className={`h-7 text-xs w-full border ${UMSETZUNG_STYLE[r.umsetzung ?? ''] ?? ''}`}
                          >
                            <SelectValue placeholder="—" />
                          </SelectTrigger>
                          <SelectContent className="z-[220]">
                            {UMSETZUNG_OPTIONS.map((u) => (
                              <SelectItem key={u} value={u}>
                                {u}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {savingId === r.id && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
                      </div>

                      {/* Funktion (read-only) + Notiz (änderbar) */}
                      <div className="text-xs text-muted-foreground space-y-1 min-w-0">
                        {r.funktion && <p className="break-words">{r.funktion}</p>}
                        {r.karte && <p>🗂 {r.karte}</p>}

                        {editNotizId === r.id ? (
                          <div className="space-y-1">
                            <Textarea
                              className="text-xs min-h-[48px]"
                              value={notizDraft}
                              onChange={(e) => setNotizDraft(e.target.value)}
                              placeholder="Notiz…"
                            />
                            <div className="flex items-center gap-1">
                              <Button size="sm" className="h-6 px-2 text-xs" onClick={() => saveNotiz(r.id)} disabled={savingId === r.id}>
                                {savingId === r.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3 mr-1" />}
                                Speichern
                              </Button>
                              <Button size="sm" variant="ghost" className="h-6 px-2 text-xs" onClick={cancelNotiz}>
                                <X className="h-3 w-3 mr-1" /> Abbrechen
                              </Button>
                            </div>
                          </div>
                        ) : (
                          <>
                            <div className="flex items-start gap-1">
                              <p className="text-amber-700 dark:text-amber-300 break-words flex-1">
                                {r.notiz ? `📝 ${r.notiz}` : <span className="text-muted-foreground/50">keine Notiz</span>}
                              </p>
                              <button
                                type="button"
                                className="text-muted-foreground hover:text-foreground shrink-0"
                                title="Notiz bearbeiten"
                                onClick={() => startNotiz(r)}
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </button>
                            </div>

                            {/* PRÜFBEFUND — kommt von der Edge Function, nicht von Uli.
                                Das ist der Unterschied zu `umsetzung`:
                                  umsetzung  = was Uli WILL (Absicht)
                                  hier unten = was WIRKLICH da ist (Befund) */}
                            {r.geprueft_status === 'fehler' && (
                              <p className="mt-1 flex items-start gap-1 text-red-700 dark:text-red-300 break-words">
                                <ShieldAlert className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                                <span>{r.geprueft_befund}</span>
                              </p>
                            )}
                            {r.geprueft_status === 'ok' && (
                              <p className="mt-1 flex items-start gap-1 text-emerald-700 dark:text-emerald-300 break-words">
                                <ShieldCheck className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                                <span>{r.geprueft_befund}</span>
                              </p>
                            )}
                            {r.geprueft_status === 'kein_code' && (
                              <p className="mt-1 flex items-start gap-1 text-muted-foreground/60 break-words">
                                <Minus className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                                <span>Menschlicher Schritt — kein Code zu prüfen</span>
                              </p>
                            )}
                            {!r.geprueft_status && (
                              <p className="mt-1 text-muted-foreground/50">
                                Noch nie gegen den Code geprüft.
                              </p>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default MaxAblaeufePanel;
