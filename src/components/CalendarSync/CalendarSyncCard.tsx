import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { RefreshCw, Calendar, Trash2, AlertTriangle, Plus, Link, Check, Upload, ChevronDown, ChevronUp, ListChecks } from "lucide-react";
import { cn } from "@/lib/utils";

// =============================================================================
// CalendarSync — iCal-Import + Kollisionswarnung (Modul CalendarSync, Phase 1)
//
// Verwaltet die iCal-Import-Feeds je Haus + Plattform (Tabelle `ical_feeds`) und
// stößt den Sync manuell an (Edge Function `ical-sync`). Der automatische Lauf
// erfolgt täglich per Cron. Kollisionen werden zusätzlich in der Morgen-Übersicht
// und per E-Mail an Uli gemeldet.
//
// Bewusst eigenes Modul — nichts in bestehende Komponenten "reingebaut".
// =============================================================================

// Dieselben Plattform-Werte wie bookings.platform (CreateBookingForm) — Konsistenz.
const PLATFORMS = [
  { value: "airbnb", label: "Airbnb" },
  { value: "booking.com", label: "Booking.com" },
  { value: "vrbo", label: "VRBO" },
  { value: "belvilla", label: "Belvilla" },
] as const;

interface House { id: string; name: string; rental_type: string | null; ical_export_token: string | null; }
interface IcalFeed {
  id: string;
  house_id: string;
  platform: string;
  feed_url: string;
  is_active: boolean;
  last_synced_at: string | null;
  last_status: string | null;
  last_event_count: number | null;
  houses?: { name: string } | null;
}

// Eingelesene Belegung aus einem Portal-Feed (Tabelle `external_blocks`).
// Enthaelt bewusst KEINE Gastdaten — iCal liefert nur Zeitraeume.
interface ExternalBlock {
  id: string;
  house_id: string;
  platform: string;
  start_date: string;
  end_date: string;
  summary: string | null;
  collision_booking_id: string | null;
  last_seen_at: string | null;
}

const platformLabel = (v: string) => PLATFORMS.find((p) => p.value === v)?.label ?? v;

// Datum tagesgenau anzeigen. `start_date`/`end_date` sind vom Typ `date`
// (reines "YYYY-MM-DD"), daher KEIN new Date() mit Zeitzonenumrechnung —
// das wuerde je nach Zeitzone einen Tag verschieben.
const tagAnzeigen = (d: string) => {
  const [j, m, t] = String(d).slice(0, 10).split("-");
  return `${t}.${m}.${j}`;
};

// Basis-URL für die öffentlichen Edge Functions (für die Export-Feed-URL).
// Nutzt dieselbe Umgebungsvariable wie der Supabase-Client — kein hartcodierter Wert.
const SUPABASE_FUNCTIONS_BASE =
  `${(import.meta.env.VITE_SUPABASE_URL as string | undefined) ?? ""}/functions/v1`;

const CalendarSyncCard = () => {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Formularzustand für einen neuen Feed
  const [houseId, setHouseId] = useState<string>("");
  const [platform, setPlatform] = useState<string>("");
  const [feedUrl, setFeedUrl] = useState<string>("");
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Nur FERIENHÄUSER laden — Dauermiet-Objekte (rental_type 'long_term') sind
  // nicht auf Airbnb/Booking/VRBO/Belvilla gelistet und haben keine iCal-Feeds.
  // Kriterium wie im Bestand: 'tourist' ODER kein rental_type gesetzt.
  const { data: houses } = useQuery({
    queryKey: ["houses", "vacation-only"],
    queryFn: async (): Promise<House[]> => {
      const { data, error } = await supabase
        .from("houses")
        .select("id, name, rental_type, ical_export_token")
        .order("name");
      if (error) throw error;
      return (data ?? []).filter(
        (h: any) => h.rental_type === "tourist" || !h.rental_type
      );
    },
  });

  // Feeds laden
  const { data: feeds, isLoading } = useQuery({
    queryKey: ["ical-feeds"],
    queryFn: async (): Promise<IcalFeed[]> => {
      const { data, error } = await supabase
        .from("ical_feeds")
        .select("id, house_id, platform, feed_url, is_active, last_synced_at, last_status, last_event_count, houses(name)")
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data as any) ?? [];
    },
  });

  // ── Eingelesene Belegungen (Phase 3: Sichtbarkeit) ──────────────────────
  //
  // WARUM: Bis hierher war der Feed eine Blackbox. Sichtbar waren nur der
  // Status ("ok · 7 Eintraege") und Kollisionen. Was tatsaechlich hereinkam,
  // liess sich nur per SQL nachsehen. Seit dem Kollisions-Fix vom 18.07.2026
  // meldet das System bei sauberer Lage gar nichts mehr — ohne diese Liste
  // gaebe es keinerlei Kontrolle darueber, ob der Import ueberhaupt greift.
  //
  // Bewusst schlicht: reine Leseansicht, keine Bearbeitung. Die Daten gehoeren
  // den Portalen, nicht diesem System.
  const [zeigeBelegungen, setZeigeBelegungen] = useState(false);

  const { data: blocks, isLoading: blocksLoading } = useQuery({
    queryKey: ["external-blocks"],
    // Erst laden, wenn der Bereich aufgeklappt wird — die Karte liegt im
    // Einstellungen-Tab und wird oft nur wegen anderer Punkte geoeffnet.
    enabled: zeigeBelegungen,
    queryFn: async (): Promise<ExternalBlock[]> => {
      const heute = new Date().toISOString().slice(0, 10);
      const { data, error } = await supabase
        .from("external_blocks")
        .select("id, house_id, platform, start_date, end_date, summary, collision_booking_id, last_seen_at")
        // Nur laufende und kuenftige Belegungen. Vergangene Zeitraeume sind
        // fuer den Doppelbuchungs-Schutz ohne Wert und wuerden die Liste fluten.
        .gte("end_date", heute)
        .order("start_date", { ascending: true });
      if (error) throw error;
      return (data as any) ?? [];
    },
  });

  // Feed anlegen
  const addFeed = useMutation({
    mutationFn: async () => {
      if (!houseId || !platform || !feedUrl.trim()) {
        throw new Error("Bitte Haus, Plattform und iCal-URL angeben.");
      }
      const { error } = await supabase.from("ical_feeds").insert({
        house_id: houseId,
        platform,
        feed_url: feedUrl.trim(),
        is_active: true,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "Feed hinzugefügt", description: "Der iCal-Feed wurde gespeichert." });
      setHouseId(""); setPlatform(""); setFeedUrl("");
      queryClient.invalidateQueries({ queryKey: ["ical-feeds"] });
    },
    onError: (e: any) => {
      toast({
        title: "Konnte Feed nicht speichern",
        description: e?.message ?? "Möglicherweise existiert für dieses Haus + Plattform schon ein Feed.",
        variant: "destructive",
      });
    },
  });

  // Feed löschen
  const deleteFeed = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("ical_feeds").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "Feed entfernt" });
      queryClient.invalidateQueries({ queryKey: ["ical-feeds"] });
    },
    onError: (e: any) =>
      toast({ title: "Löschen fehlgeschlagen", description: e?.message, variant: "destructive" }),
  });

  // Sync manuell auslösen (echter Lauf)
  const runSync = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("ical-sync", {
        body: { dry_run: false },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (data: any) => {
      const koll = data?.neue_kollisionen ?? 0;
      toast({
        title: koll > 0 ? `⚠️ ${koll} Kollision(en) erkannt` : "Sync abgeschlossen",
        description: koll > 0
          ? "Details in der Morgen-Übersicht und per E-Mail."
          : `${data?.feeds ?? 0} Feed(s) abgeglichen, keine Kollisionen.`,
        variant: koll > 0 ? "destructive" : undefined,
      });
      queryClient.invalidateQueries({ queryKey: ["ical-feeds"] });
    },
    onError: (e: any) =>
      toast({ title: "Sync fehlgeschlagen", description: e?.message, variant: "destructive" }),
  });

  const houseName = (f: IcalFeed) => f.houses?.name ?? houses?.find((h) => h.id === f.house_id)?.name ?? "—";

  return (
    <div className="rounded-lg border border-border p-4 space-y-4">
      {/* Kopf */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div className="flex items-center gap-2">
          <Calendar className="w-5 h-5 text-primary" />
          <h3 className="font-semibold">Kalender-Sync (iCal)</h3>
        </div>
        <Button
          onClick={() => runSync.mutate()}
          disabled={runSync.isPending || !feeds?.length}
          className="w-full sm:w-auto"
        >
          <RefreshCw className={cn("w-4 h-4 mr-2", runSync.isPending && "animate-spin")} />
          {runSync.isPending ? "Sync läuft…" : "Jetzt synchronisieren"}
        </Button>
      </div>

      <p className="text-xs text-muted-foreground">
        Liest Belegungen von Airbnb, Booking.com, VRBO und Belvilla ein und warnt bei
        Überschneidungen mit eigenen Buchungen. iCal liefert nur Zeiträume (keine
        Gastdaten) und ist verzögert — ein Sicherheitsnetz, kein Echtzeitschutz.
        Der automatische Abgleich läuft täglich; du kannst ihn hier auch manuell starten.
      </p>

      {/* Neuen Feed anlegen */}
      <div className="rounded-md border border-border/60 p-3 space-y-3">
        <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Feed hinzufügen
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <Select value={houseId} onValueChange={setHouseId}>
            <SelectTrigger><SelectValue placeholder="Haus wählen" /></SelectTrigger>
            <SelectContent>
              {houses?.map((h) => (
                <SelectItem key={h.id} value={h.id}>{h.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={platform} onValueChange={setPlatform}>
            <SelectTrigger><SelectValue placeholder="Plattform wählen" /></SelectTrigger>
            <SelectContent>
              {PLATFORMS.map((p) => (
                <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Input
          placeholder="iCal-URL der Plattform (endet meist auf .ics)"
          value={feedUrl}
          onChange={(e) => setFeedUrl(e.target.value)}
        />
        <Button
          onClick={() => addFeed.mutate()}
          disabled={addFeed.isPending}
          variant="secondary"
          className="w-full sm:w-auto"
        >
          <Plus className="w-4 h-4 mr-2" />
          Feed speichern
        </Button>
      </div>

      {/* Feed-Liste */}
      <div className="space-y-2">
        <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Aktive Feeds
        </div>
        {isLoading ? (
          <p className="text-xs text-muted-foreground">Lädt…</p>
        ) : !feeds?.length ? (
          <div className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-2 text-xs text-amber-700 dark:text-amber-300">
            <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
            <span>Noch keine Feeds hinterlegt. Füge oben pro Haus und Plattform die iCal-URL hinzu.</span>
          </div>
        ) : (
          <ul className="space-y-2">
            {feeds.map((f) => (
              <li
                key={f.id}
                className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 rounded-md border border-border/60 p-2"
              >
                <div className="min-w-0">
                  <div className="text-sm font-medium">
                    {houseName(f)} · {platformLabel(f.platform)}
                  </div>
                  <div className="text-xs text-muted-foreground truncate">{f.feed_url}</div>
                  <div className="text-xs text-muted-foreground">
                    {f.last_synced_at
                      ? `Letzter Sync: ${new Date(f.last_synced_at).toLocaleString("de-DE")}` +
                        (f.last_status ? ` · ${f.last_status}` : "") +
                        (f.last_event_count != null ? ` · ${f.last_event_count} Einträge` : "")
                      : "Noch nicht synchronisiert"}
                  </div>
                </div>
                <Button
                  onClick={() => deleteFeed.mutate(f.id)}
                  disabled={deleteFeed.isPending}
                  variant="ghost"
                  size="sm"
                  className="text-destructive hover:text-destructive w-full sm:w-auto"
                  aria-label="Feed löschen"
                >
                  <Trash2 className="w-4 h-4 sm:mr-0 mr-2" />
                  <span className="sm:hidden">Entfernen</span>
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>
      {/* ── Phase 3: Eingelesene Belegungen (Sichtbarkeit) ───────────────── */}
      <div className="space-y-2 border-t border-border pt-4">
        <Button
          onClick={() => setZeigeBelegungen((v) => !v)}
          variant="ghost"
          size="sm"
          className="w-full sm:w-auto justify-start px-2"
          aria-expanded={zeigeBelegungen}
        >
          <ListChecks className="w-4 h-4 mr-2 text-primary" />
          Eingelesene Belegungen
          {zeigeBelegungen
            ? <ChevronUp className="w-4 h-4 ml-2" />
            : <ChevronDown className="w-4 h-4 ml-2" />}
        </Button>

        {zeigeBelegungen && (
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">
              Was die Portale an Belegungen melden — laufende und kommende
              Zeiträume. iCal liefert <strong>keine Gastdaten</strong>, nur
              Zeiträume. Rot markiert = überschneidet sich mit einer eigenen
              Buchung.
            </p>

            {blocksLoading ? (
              <p className="text-xs text-muted-foreground">Lädt…</p>
            ) : !blocks?.length ? (
              <p className="text-xs text-muted-foreground">
                Keine laufenden oder kommenden Belegungen eingelesen.
              </p>
            ) : (
              <ul className="space-y-1.5">
                {blocks.map((b) => {
                  const kollision = b.collision_booking_id !== null;
                  return (
                    <li
                      key={b.id}
                      className={cn(
                        "flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 rounded-md border p-2 text-xs",
                        kollision
                          ? "border-destructive/50 bg-destructive/5"
                          : "border-border/60"
                      )}
                    >
                      <div className="min-w-0">
                        <div className="font-medium">
                          {houses?.find((h) => h.id === b.house_id)?.name ?? "—"}
                          {" · "}
                          {platformLabel(b.platform)}
                        </div>
                        {b.summary && (
                          <div className="text-muted-foreground truncate">{b.summary}</div>
                        )}
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {kollision && (
                          <span className="flex items-center gap-1 text-destructive font-medium">
                            <AlertTriangle className="w-3.5 h-3.5" />
                            Kollision
                          </span>
                        )}
                        <span className="text-muted-foreground whitespace-nowrap">
                          {tagAnzeigen(b.start_date)} – {tagAnzeigen(b.end_date)}
                        </span>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        )}
      </div>

      {/* ── Phase 2: Export-URLs (mein System -> Portale) ────────────────── */}
      <div className="space-y-2 border-t border-border pt-4">
        <div className="flex items-center gap-2">
          <Upload className="w-4 h-4 text-primary" />
          <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Mein Kalender für die Portale
          </span>
        </div>
        <p className="text-xs text-muted-foreground">
          Diese URL trägst du bei Airbnb/VRBO/Belvilla unter „anderen Kalender
          verbinden" ein. Sie enthält <strong>nur deine Direktbuchungen</strong> —
          so blocken die Portale diese Termine.
          {" "}Hinweis: Booking.com akzeptiert seit 2025 keine Kalender von eigenen
          Seiten; dort funktioniert nur die Import-Richtung oben.
        </p>

        {!houses?.length ? (
          <p className="text-xs text-muted-foreground">Keine Ferienhäuser gefunden.</p>
        ) : (
          <ul className="space-y-2">
            {houses.map((h) => {
              const exportUrl = h.ical_export_token
                ? `${SUPABASE_FUNCTIONS_BASE}/ical-export/${h.ical_export_token}.ics`
                : null;
              return (
                <li key={h.id} className="rounded-md border border-border/60 p-2 space-y-1">
                  <div className="text-sm font-medium">{h.name}</div>
                  {!exportUrl ? (
                    <div className="text-xs text-amber-700 dark:text-amber-300">
                      Kein Export-Token vorhanden — SQL 33_ical_export_token.sql ausführen.
                    </div>
                  ) : (
                    <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                      <code className="text-[11px] bg-muted rounded px-2 py-1 truncate flex-1">
                        {exportUrl}
                      </code>
                      <Button
                        variant="secondary"
                        size="sm"
                        className="w-full sm:w-auto shrink-0"
                        onClick={async () => {
                          try {
                            await navigator.clipboard.writeText(exportUrl);
                            setCopiedId(h.id);
                            setTimeout(() => setCopiedId((c) => (c === h.id ? null : c)), 2000);
                            toast({ title: "URL kopiert", description: `${h.name} — jetzt beim Portal einfügen.` });
                          } catch {
                            toast({
                              title: "Kopieren fehlgeschlagen",
                              description: "Bitte die URL manuell markieren und kopieren.",
                              variant: "destructive",
                            });
                          }
                        }}
                      >
                        {copiedId === h.id ? (
                          <><Check className="w-4 h-4 mr-2" />Kopiert</>
                        ) : (
                          <><Link className="w-4 h-4 mr-2" />Kopieren</>
                        )}
                      </Button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
};

export default CalendarSyncCard;
