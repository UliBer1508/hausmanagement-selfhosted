import { useState, useEffect, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useToast } from '@/hooks/use-toast';
import { Save, RotateCcw, Plus, Trash2, Info, Pencil } from 'lucide-react';
import { LinenItemConfig, ItemColor, LinenColor, ITEM_COLORS, LINEN_COLORS } from '@/types/linen';
import { migrateOldToNewStructure, groupByCategory } from '@/lib/linenMigration';
import { LinenItemDialog } from './LinenItemDialog';
import { useLaundryArticles, istWaehlbar, type LaundryArticle } from '@/hooks/useLaundryArticles';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

interface LinenSetRulesTabProps {
  house: any;
}

/** Artikelnummer einer Set-Zeile, oder null. */
const artikelVon = (item: LinenItemConfig): string | null =>
  item?.external_artikelnummer?.['default'] || null;

/**
 * Set-Zeilen nach Artikelnummer gruppieren. Nur Zeilen MIT Artikel.
 */
function gruppiereNachArtikel(
  items: Record<string, LinenItemConfig>,
): Map<string, string[]> {
  const gruppen = new Map<string, string[]>();
  for (const [key, item] of Object.entries(items)) {
    const nr = artikelVon(item);
    if (!nr) continue;
    gruppen.set(nr, [...(gruppen.get(nr) ?? []), key]);
  }
  return gruppen;
}

/**
 * Sorgt dafuer, dass in jeder Paketgruppe GENAU EINE Zeile abrechnet.
 *
 * Wird nach jeder Artikelaenderung aufgerufen, nicht beim Laden. Beim Laden
 * wuerde eine stille Korrektur sofort "ungespeicherte Aenderungen" erzeugen,
 * ohne dass jemand etwas getan hat — verwirrend und schwer nachzuvollziehen.
 * Altbestand faengt stattdessen die Pruefung vor dem Speichern ab.
 *
 * Einzelzeilen bekommen preis_zaehlt = undefined: bei einem Artikel, der nur
 * einmal vorkommt, ist die Marke gegenstandslos, und ein gespeichertes true
 * wuerde nur so aussehen, als gaebe es eine Entscheidung zu treffen.
 */
function normalisierePaketgruppen(
  items: Record<string, LinenItemConfig>,
): Record<string, LinenItemConfig> {
  const next = { ...items };
  for (const keys of gruppiereNachArtikel(items).values()) {
    if (keys.length === 1) {
      if (next[keys[0]].preis_zaehlt !== undefined) {
        next[keys[0]] = { ...next[keys[0]], preis_zaehlt: undefined };
      }
      continue;
    }
    // Bereits markierte Zeile behalten, sonst die erste der Gruppe nehmen.
    // Waeren mehrere markiert (Altbestand), gewinnt die erste.
    const gewinner = keys.find((k) => next[k].preis_zaehlt === true) ?? keys[0];
    for (const k of keys) {
      next[k] = { ...next[k], preis_zaehlt: k === gewinner };
    }
  }
  return next;
}

/*
 * Auswahl des Teuni-Artikels fuer eine Set-Zeile.
 *
 * Angeboten wird nur, was fachlich auf eine Set-Zeile gehoert (istWaehlbar):
 * kein KLGEW, keine Lohnwaesche, und von einer Nummernfolge wie
 * MWR -> MW3 -> MW4 nur die aktuelle. Wuerde man hier MW3 waehlen koennen,
 * waehrend MW4 die aktuelle Nummer ist, brächten neue Rechnungen ihren Preis
 * an MW4 — die Set-Zeile bliebe an MW3 haengen und der Preis fröre still ein.
 *
 * ABER: Ein bereits GESPEICHERTER Artikel wird immer angezeigt, auch wenn er
 * nicht mehr waehlbar ist. Sonst saehe das Feld leer aus, obwohl ein Wert in
 * der Datenbank steht — der schlimmere Fehler, weil er unsichtbar ist.
 * Venediger traegt heute MW3 auf `bettwaesche`; nach dem Setzen der Kette ist
 * MW3 nicht mehr waehlbar und muss trotzdem sichtbar bleiben, samt Hinweis
 * auf den Nachfolger.
 */
function ArtikelWahl({
  wert,
  artikel,
  laedt,
  geteilt,
  zaehlt,
  onChange,
  onZaehlt,
}: {
  /** Aktuell gespeicherte Artikelnummer, oder leer. */
  wert: string;
  /** Alle Artikel des Dienstleisters, ungefiltert. */
  artikel: LaundryArticle[];
  laedt: boolean;
  /** Derselbe Artikel steht auf mehr als einer Set-Zeile. */
  geteilt: boolean;
  /** Diese Zeile ist die abrechnungsrelevante ihrer Gruppe. */
  zaehlt: boolean;
  onChange: (nummer: string | null) => void;
  onZaehlt: () => void;
}) {
  const waehlbare = artikel.filter(istWaehlbar);
  const gesetzt = wert ? artikel.find((a) => a.artikelnummer === wert) : undefined;
  const gesetztFehlt = !!wert && !waehlbare.some((a) => a.artikelnummer === wert);

  const preisText = (a: LaundryArticle) =>
    a.preis !== null ? ` · ${a.preis.toFixed(2).replace('.', ',')} €` : '';

  return (
    <div className="space-y-1">
      <Select
        value={wert || '__keiner__'}
        onValueChange={(v) => onChange(v === '__keiner__' ? null : v)}
      >
        <SelectTrigger className="w-[190px] text-xs">
          <SelectValue placeholder={laedt ? 'lädt…' : 'kein Artikel'} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="__keiner__">— kein Artikel —</SelectItem>

          {waehlbare.map((a) => (
            <SelectItem key={a.id} value={a.artikelnummer}>
              {a.artikelnummer} · {a.bezeichnung ?? '—'}
              {preisText(a)}
            </SelectItem>
          ))}

          {/* Gespeicherter, aber nicht mehr waehlbarer Artikel. Bleibt sichtbar,
              damit klar wird, WAS gespeichert ist und WARUM es zu ersetzen ist. */}
          {gesetztFehlt && (
            <SelectItem value={wert}>
              {wert} · {gesetzt?.bezeichnung ?? 'unbekannter Artikel'}
              {gesetzt?.nachfolger_nummer
                ? ` — ersetzt durch ${gesetzt.nachfolger_nummer}`
                : gesetzt
                  ? ' — nicht mehr wählbar'
                  : ' — nicht im Sortiment'}
            </SelectItem>
          )}
        </SelectContent>
      </Select>

      {/*
        Erscheint nur, wenn derselbe Artikel auf mehreren Zeilen steht — also
        bei einem Paket. Bewusst ein Ankreuzfeld, das sich nur EINschalten
        laesst: Ausschalten wuerde die Gruppe ohne abrechnende Zeile
        zuruecklassen, und der Preis waere dann fuer niemanden bestimmt.
        Umschalten geschieht dadurch, dass eine ANDERE Zeile angekreuzt wird.
      */}
      {geteilt && (
        <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <Checkbox
            checked={zaehlt}
            onCheckedChange={(c) => { if (c) onZaehlt(); }}
            className="h-3.5 w-3.5"
          />
          <span>{zaehlt ? 'wird berechnet' : 'im Paket enthalten'}</span>
        </label>
      )}
    </div>
  );
}

const LinenSetRulesTab = ({ house }: LinenSetRulesTabProps) => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [items, setItems] = useState<Record<string, LinenItemConfig>>({});
  const [originalItems, setOriginalItems] = useState<Record<string, LinenItemConfig>>({});
  const [hasChanges, setHasChanges] = useState(false);
  const [showAddDialog, setShowAddDialog] = useState(false);
  // Zeile, die gerade bearbeitet wird — null heisst: neu anlegen (05.09.2026)
  const [editKey, setEditKey] = useState<string | null>(null);
  const [deleteKey, setDeleteKey] = useState<string | null>(null);
  const [hasMigrated, setHasMigrated] = useState(false);

  /*
   * Teunis Sortiment (laundry_articles). Seit 04.09.2026 die Quelle fuer die
   * Spalte "Teuni-Artikel": vorher stand dort ein Freitextfeld mit selbst
   * vergebenen WA-Nummern aus dem abgeloesten externen System. Auswahlliste
   * statt Freitext, damit keine Nummer eingetragen werden kann, die es nicht
   * gibt — ein Tippfehler wuerde beim Rechnungsabgleich still ins Leere laufen.
   */
  const { data: teuniArtikel = [], isLoading: artikelLaden } = useLaundryArticles();

  // Fetch current linen set definitions
  const { data: linenDef, isLoading } = useQuery({
    queryKey: ['linen-definitions', house?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('linen_set_definitions')
        .select('*')
        .eq('house_id', house.id)
        .maybeSingle();
      
      if (error && error.code !== 'PGRST116') throw error;
      return data;
    },
    enabled: !!house?.id,
  });

  // Migrate old structure to new on first load + auto-save missing colors
  useEffect(() => {
    if (linenDef && !hasMigrated) {
      const migratedItems = migrateOldToNewStructure(linenDef);
      setItems(migratedItems);
      
      const dbItems = linenDef.custom_categories || {};
      setOriginalItems(JSON.parse(JSON.stringify(dbItems)));
      setHasMigrated(true);
      
      // Prüfen ob Migration neue color-Felder hinzugefügt hat
      const hasNewColorFields = Object.entries(migratedItems).some(([key, item]) => {
        const dbItem = dbItems[key];
        return item.color !== undefined && (!dbItem || dbItem.color === undefined);
      });
      
      // Wenn neue Farben hinzugefügt wurden, automatisch speichern
      if (hasNewColorFields && Object.keys(dbItems).length > 0) {
        console.log('Migration: Speichere fehlende color-Felder automatisch...');
        supabase
          .from('linen_set_definitions')
          .update({ custom_categories: JSON.parse(JSON.stringify(migratedItems)) })
          .eq('house_id', house.id)
          .then(({ error }) => {
            if (!error) {
              console.log('Migration: color-Felder erfolgreich gespeichert');
              setOriginalItems(JSON.parse(JSON.stringify(migratedItems)));
              queryClient.invalidateQueries({ queryKey: ['linen-definitions', house.id] });
            }
          });
      }
    }
  }, [linenDef, hasMigrated, house?.id, queryClient]);

  // Check for changes
  useEffect(() => {
    const itemsChanged = JSON.stringify(items) !== JSON.stringify(originalItems);
    setHasChanges(itemsChanged);
  }, [items, originalItems]);

  // Group items by category
  const groupedItems = useMemo(() => groupByCategory(items), [items]);

  // Update item
  const updateItem = (key: string, updates: Partial<LinenItemConfig>) => {
    setItems(prev => ({
      ...prev,
      [key]: { ...prev[key], ...updates }
    }));
  };

  /*
   * Artikel einer Zeile setzen oder entfernen.
   *
   * Eigener Handler statt updateItem, weil die Aenderung ueber die Zeile
   * hinaus wirkt: entsteht dadurch eine Paketgruppe, muss darin genau eine
   * Zeile abrechnen. Eine alte Marke der geaenderten Zeile faellt weg — sie
   * gehoerte zum vorherigen Artikel.
   */
  const setArtikel = (key: string, nummer: string | null) => {
    setItems(prev => normalisierePaketgruppen({
      ...prev,
      [key]: {
        ...prev[key],
        external_artikelnummer: nummer === null ? {} : { default: nummer },
        preis_zaehlt: undefined,
      },
    }));
  };

  /*
   * Diese Zeile rechnet ab, die uebrigen der Gruppe nicht. Wirkt auf alle
   * Zeilen mit derselben Artikelnummer, quer ueber die Kategorien: bei Wald
   * liegen Bettwaesche, Kissenbezuege und Spannbetttuecher zwar alle im
   * Schlafbereich, das ist aber Zufall und keine Regel.
   */
  const setPreiszeile = (nummer: string, key: string) => {
    setItems(prev => {
      const next = { ...prev };
      for (const [k, item] of Object.entries(prev)) {
        if (artikelVon(item) === nummer) {
          next[k] = { ...item, preis_zaehlt: k === key };
        }
      }
      return next;
    });
  };

  /*
   * Welche Set-Zeilen teilen sich einen Artikel? Wird fuer die Anzeige der
   * Abrechnungsmarke gebraucht.
   */
  const artikelGruppen = useMemo(() => gruppiereNachArtikel(items), [items]);

  /*
   * Vor dem Speichern: In jeder Paketgruppe muss genau eine Zeile abrechnen.
   *
   * setArtikel haelt das im laufenden Betrieb ein — diese Pruefung faengt
   * Altbestand ab, der vor dem 05.09.2026 gespeichert wurde und noch keine
   * Marke traegt. Lieber eine Meldung als eine Kostenrechnung, die ein Paket
   * dreifach zaehlt oder gar nicht.
   *
   * Rueckgabe: null = in Ordnung, sonst der Grund im Klartext.
   */
  const pruefePaketgruppen = (): string | null => {
    for (const [nummer, keys] of artikelGruppen) {
      if (keys.length < 2) continue;
      const markiert = keys.filter((k) => items[k].preis_zaehlt === true);
      const namen = keys.map((k) => items[k].label).join(', ');
      if (markiert.length === 0) {
        return `${nummer} steht auf mehreren Zeilen (${namen}). Kreuze an, welche davon berechnet wird.`;
      }
      if (markiert.length > 1) {
        return `${nummer} ist auf ${markiert.length} Zeilen als berechnet markiert. Es darf nur eine sein.`;
      }
    }
    return null;
  };

  /*
   * Zeile anlegen oder aendern.
   *
   * Beim Bearbeiten behaelt der Dialog den urspruenglichen `key` bei, die
   * Zeile wird also an derselben Stelle ersetzt. Danach laeuft die
   * Paketnormalisierung, weil sich die Artikelzuordnung theoretisch
   * geaendert haben koennte.
   */
  const handleAddItem = (newItem: LinenItemConfig) => {
    setItems(prev => normalisierePaketgruppen({
      ...prev,
      [newItem.key]: newItem,
    }));
    setEditKey(null);
  };

  // Delete item
  const handleDelete = (key: string) => {
    const { [key]: removed, ...rest } = items;
    setItems(rest);
    setDeleteKey(null);
  };

  // Save mutation
  const saveMutation = useMutation({
    mutationFn: async () => {
      // 1. Save linen rules to linen_set_definitions
      const updateData = {
        house_id: house.id,
        custom_categories: items as any,
        // Set old columns to 0 for backward compatibility
        bedding_per_guest: 0,
        large_towels_per_guest: 0,
        small_towels_per_guest: 0,
        sauna_towels_per_guest: 0,
        blankets_per_guest: 0,
        pillow_cases_per_guest: 0,
        bath_mats_per_booking: 0,
        sink_towels_per_booking: 0,
        kitchen_towels_per_booking: 0,
        table_linens_per_booking: 0
      };

      const { data: existing } = await supabase
        .from('linen_set_definitions')
        .select('id')
        .eq('house_id', house.id)
        .maybeSingle();

      if (existing) {
        const { error } = await supabase
          .from('linen_set_definitions')
          .update(updateData)
          .eq('house_id', house.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('linen_set_definitions')
          .insert(updateData);
        if (error) throw error;
      }

    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['linen-definitions'] });
      setOriginalItems(JSON.parse(JSON.stringify(items)));
      setHasChanges(false);
      toast({
        title: "✅ Gespeichert",
        description: "Wäschesets wurden aktualisiert",
      });
    },
    onError: (error) => {
      toast({
        title: "❌ Fehler",
        description: "Wäschesets konnten nicht gespeichert werden",
        variant: "destructive",
      });
      console.error('Save error:', error);
    }
  });

  const handleReset = () => {
    setItems(JSON.parse(JSON.stringify(originalItems)));
    setHasChanges(false);
  };

  /*
   * Speichern nur, wenn jede Paketgruppe genau eine abrechnende Zeile hat.
   * Steht hier und nicht in der Mutation, damit die Meldung den konkreten
   * Grund nennen kann statt eines allgemeinen Fehlers.
   */
  const handleSave = () => {
    const grund = pruefePaketgruppen();
    if (grund) {
      toast({
        title: 'Noch nicht speicherbar',
        description: grund,
        variant: 'destructive',
      });
      return;
    }
    saveMutation.mutate();
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="text-muted-foreground">Lade Wäschesets...</div>
      </div>
    );
  }

  const categoryIcons = {
    'Schlafbereich': '🛏️',
    'Badbereich': '🛁',
    'Wellness': '🧖',
    'Küchenbereich': '🍴'
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Wäschesets für {house.name}</CardTitle>
              <CardDescription>
                Definieren Sie, welche Wäschesets pro Gast oder pro Buchung benötigt werden
              </CardDescription>
            </div>
            {/* Der Umschalter "Eigene / Teuni" ist am 04.09.2026 entfallen.
                Er schaltete auf TeuniSourcePanel, das seine Artikel ueber
                useExternalStammdaten aus dem FREMDEN Supabase-Projekt von
                Waesche Oberpinzgau holte — diese Anbindung ist tot. Es gibt
                jetzt nur noch eine Quelle: Teunis Artikel SIND unsere
                Artikel, nachzulesen in laundry_articles. */}
            <div className="flex gap-2">
              <Button onClick={() => setShowAddDialog(true)} size="sm">
                <Plus className="w-4 h-4 mr-2" />
                Neues Item
              </Button>
              {hasChanges && (
                <>
                  <Button onClick={handleReset} variant="outline" size="sm">
                    <RotateCcw className="w-4 h-4 mr-2" />
                    Zurücksetzen
                  </Button>
                  <Button onClick={handleSave} size="sm">
                    <Save className="w-4 h-4 mr-2" />
                    Speichern
                  </Button>
                </>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <>
          <Alert className="mb-4">
            <Info className="h-4 w-4" />
            <AlertDescription>
              Die Tabelle ist immer editierbar. Änderungen werden mit <strong>Speichern</strong> übernommen.
              <strong> Teuni-Artikel</strong>: der Artikel, unter dem Teuni diese Position berechnet.
              Mehrere Zeilen dürfen denselben Artikel tragen — „Mietwäsche Paket 5 Tlg“ deckt
              mehrere Positionen ab. Dann erscheint unter der Auswahl ein Kästchen: kreuze die
              eine Zeile an, über die das Paket berechnet wird. Die übrigen sind darin enthalten
              und gehen nicht zusätzlich in die Kosten ein.
            </AlertDescription>
          </Alert>

          {teuniArtikel.length === 0 && !artikelLaden && (
            <Alert className="mb-4">
              <Info className="h-4 w-4" />
              <AlertDescription>
                Noch keine Wäscheartikel erfasst. Sie entstehen beim Einlesen einer
                Rechnung von Teuni im Tab <strong>Dokumente</strong>.
              </AlertDescription>
            </Alert>
          )}

          {Object.entries(groupedItems).map(([category, categoryItems]) => (
            categoryItems.length > 0 && (
              <div key={category} className="mb-8">
                <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
                  <span>{categoryIcons[category as keyof typeof categoryIcons]}</span>
                  {category}
                </h3>
                <div className="border rounded-lg overflow-hidden overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-[180px]">Wäsche</TableHead>
                        <TableHead className="w-[80px]">Anzahl</TableHead>
                        <TableHead className="w-[120px]">Berechnung</TableHead>
                        <TableHead className="w-[120px]">Verfügbarkeit</TableHead>
                        {(category === 'Badbereich' || category === 'Wellness' || category === 'Schlafbereich' || category === 'Küchenbereich') && (
                          <TableHead className="w-[100px]">Farbe</TableHead>
                        )}
                        <TableHead className="w-[80px]">Winter</TableHead>
                        <TableHead className="w-[80px]">Sommer</TableHead>
                        <TableHead className="w-[200px]">Teuni-Artikel</TableHead>
                        <TableHead className="w-[100px]">Aktionen</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {categoryItems.map(item => (
                        <TableRow key={item.key}>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <span className="text-xl">{item.icon}</span>
                              <span className="font-medium">{item.label}</span>
                            </div>
                          </TableCell>
                          <TableCell>
                            <Input
                              type="number"
                              min={0}
                              max={99}
                              value={item.quantity}
                              onChange={(e) => updateItem(item.key, { quantity: parseInt(e.target.value) || 0 })}
                              className="w-20"
                            />
                          </TableCell>
                          <TableCell>
                            <Select
                              value={item.calculation_type}
                              onValueChange={(v) => updateItem(item.key, { calculation_type: v as any })}
                            >
                              <SelectTrigger>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="per_guest">pro Gast</SelectItem>
                                <SelectItem value="per_booking">pro Buchung</SelectItem>
                              </SelectContent>
                            </Select>
                          </TableCell>
                          <TableCell>
                            <Select
                              value={item.availability}
                              onValueChange={(v) => {
                                updateItem(item.key, {
                                  availability: v as any,
                                  season: v === 'year_round' ? null : item.season
                                });
                              }}
                            >
                              <SelectTrigger>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="year_round">ganzes Jahr</SelectItem>
                                <SelectItem value="seasonal">saisonal</SelectItem>
                              </SelectContent>
                            </Select>
                          </TableCell>
                          {(category === 'Badbereich' || category === 'Wellness' || category === 'Schlafbereich' || category === 'Küchenbereich') && (
                            <TableCell>
                              <Select
                                value={item.color || ''}
                                onValueChange={(v) => updateItem(item.key, { color: v as ItemColor | LinenColor })}
                              >
                                <SelectTrigger className="w-28">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  {category === 'Schlafbereich' 
                                    ? LINEN_COLORS.map(c => (
                                        <SelectItem key={c.key} value={c.key}>
                                          {c.icon} {c.label}
                                        </SelectItem>
                                      ))
                                    : ITEM_COLORS.map(c => (
                                        <SelectItem key={c.key} value={c.key}>
                                          {c.icon} {c.label}
                                        </SelectItem>
                                      ))
                                  }
                                </SelectContent>
                              </Select>
                            </TableCell>
                          )}
                          <TableCell>
                            {item.availability === 'seasonal' && (
                              <Checkbox
                                checked={item.season === 'winter'}
                                onCheckedChange={(checked) => 
                                  updateItem(item.key, { season: checked ? 'winter' : 'summer' })
                                }
                              />
                            )}
                          </TableCell>
                          <TableCell>
                            {item.availability === 'seasonal' && (
                              <Checkbox
                                checked={item.season === 'summer'}
                                onCheckedChange={(checked) => 
                                  updateItem(item.key, { season: checked ? 'summer' : 'winter' })
                                }
                              />
                            )}
                          </TableCell>
                          <TableCell>
                            {/*
                              Teuni-Artikel statt Freitext (04.09.2026).
                              Vorher: selbst vergebene WA-Nummern, farbabhaengig
                              per "/" aufgeteilt (WA001/WA005). Teuni fuehrt
                              KEINE getrennten Nummern je Farbe — MW3 ist MW3,
                              ob bunt oder weiss. Deshalb ein Wert unter
                              'default'; die Farbe steht weiterhin in der
                              eigenen Spalte daneben und bleibt unsere Angabe.
                            */}
                            <ArtikelWahl
                              wert={artikelVon(item) ?? ''}
                              artikel={teuniArtikel}
                              laedt={artikelLaden}
                              geteilt={(artikelGruppen.get(artikelVon(item) ?? '')?.length ?? 0) > 1}
                              zaehlt={item.preis_zaehlt === true}
                              onChange={(nummer) => setArtikel(item.key, nummer)}
                              onZaehlt={() => {
                                const nr = artikelVon(item);
                                if (nr) setPreiszeile(nr, item.key);
                              }}
                            />
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1">
                              <Button
                                variant="ghost"
                                size="sm"
                                title="Name, Symbol und Kategorie bearbeiten"
                                onClick={() => { setEditKey(item.key); setShowAddDialog(true); }}
                              >
                                <Pencil className="w-4 h-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                title="Zeile löschen"
                                onClick={() => setDeleteKey(item.key)}
                              >
                                <Trash2 className="w-4 h-4 text-destructive" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            )
          ))}
          </>
        </CardContent>
      </Card>

      <LinenItemDialog
        open={showAddDialog}
        onOpenChange={(offen) => {
          setShowAddDialog(offen);
          if (!offen) setEditKey(null);
        }}
        onSave={handleAddItem}
        existingKeys={Object.keys(items)}
        bearbeiten={editKey ? items[editKey] : null}
      />

      <AlertDialog open={!!deleteKey} onOpenChange={() => setDeleteKey(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Wäsche-Item löschen?</AlertDialogTitle>
            <AlertDialogDescription>
              Möchten Sie "{items[deleteKey!]?.label}" wirklich löschen? Diese Aktion kann nicht rückgängig gemacht werden.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Abbrechen</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleteKey && handleDelete(deleteKey)}>
              Löschen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default LinenSetRulesTab;
