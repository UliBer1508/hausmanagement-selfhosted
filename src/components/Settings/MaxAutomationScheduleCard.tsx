import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, Save, Clock, AlertTriangle, Info } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

/**
 * Steuert die Uhrzeiten der vier Max-Automatiken — in DEUTSCHER Zeit.
 *
 * HINTERGRUND:
 * Die Cron-Jobs laufen in UTC (der Supabase-Server steht auf GMT und laesst
 * sich nicht umstellen). Diese Karte nimmt deutsche Zeit entgegen; die
 * Datenbankfunktion `apply_max_automation_schedule()` rechnet um und
 * programmiert die Crons neu.
 *
 * ZEITUMSTELLUNG:
 * pg_cron kennt keine Sommerzeit. Die Umrechnung geschieht beim Speichern.
 * Nach der Zeitumstellung (Ende Maerz / Ende Oktober) die Zeiten einmal neu
 * speichern — dann stimmt alles wieder. Die Karte weist darauf hin.
 *
 * REIHENFOLGE:
 * Der Ueberfaellig-Waechter MUSS vor der Morgen-Uebersicht laufen, sonst
 * fehlen die ueberfaelligen Vorgaenge in der E-Mail. Die Karte warnt.
 */

interface ScheduleRow {
  job_key: string;
  jobname: string;
  local_time: string;      // "06:15:00"
  enabled: boolean;
  sort_order: number;
  beschreibung: string | null;
}

const LABELS: Record<string, string> = {
  overdue_watch:      'Überfällig-Wächter',
  morning_summary:    'Morgen-Übersicht (E-Mail an dich)',
  cleaning_reminders: 'Amela: Termin-Nachfrage',
  linen_reminders:    'Teuni: Wäsche-Erinnerung',
};

/** "06:15:00" -> "06:15" */
const toInput = (t: string) => (t || '').slice(0, 5);

const MaxAutomationScheduleCard = () => {
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: rows, isLoading } = useQuery({
    queryKey: ['max-automation-schedule'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('max_automation_schedule')
        .select('job_key, jobname, local_time, enabled, sort_order, beschreibung')
        .order('sort_order');
      if (error) throw error;
      return (data ?? []) as ScheduleRow[];
    },
  });

  // Lokaler Bearbeitungsstand
  const [times, setTimes] = useState<Record<string, string>>({});
  const [flags, setFlags] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (!rows) return;
    const t: Record<string, string> = {};
    const f: Record<string, boolean> = {};
    rows.forEach((r) => {
      t[r.job_key] = toInput(r.local_time);
      f[r.job_key] = r.enabled;
    });
    setTimes(t);
    setFlags(f);
  }, [rows]);

  // Reihenfolgen-Pruefung: Waechter muss VOR der Uebersicht laufen
  const reihenfolgeVerletzt =
    !!times.overdue_watch &&
    !!times.morning_summary &&
    flags.overdue_watch !== false &&
    times.overdue_watch >= times.morning_summary;

  const speichern = useMutation({
    mutationFn: async () => {
      // 1. Zeiten schreiben
      for (const r of rows ?? []) {
        const neueZeit = times[r.job_key];
        const neuAktiv = flags[r.job_key];
        if (neueZeit === toInput(r.local_time) && neuAktiv === r.enabled) continue;

        const { error } = await supabase
          .from('max_automation_schedule')
          .update({
            local_time: `${neueZeit}:00`,
            enabled: neuAktiv,
            updated_at: new Date().toISOString(),
          })
          .eq('job_key', r.job_key);
        if (error) throw error;
      }

      // 2. Crons neu programmieren (rechnet deutsche Zeit -> UTC)
      const { data, error } = await supabase.rpc('apply_max_automation_schedule');
      if (error) throw error;
      if (data && (data as any).success === false) {
        throw new Error((data as any).error ?? 'Unbekannter Fehler');
      }
      return data as any;
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['max-automation-schedule'] });
      toast({
        title: 'Zeiten übernommen',
        description: data?.versatz
          ? `Die Automatik läuft jetzt nach deutscher Zeit (${data.versatz}).`
          : 'Die Automatik läuft jetzt nach deutscher Zeit.',
      });
    },
    onError: (e) => {
      toast({
        title: 'Fehler beim Speichern',
        description: e instanceof Error ? e.message : String(e),
        variant: 'destructive',
      });
    },
  });

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start gap-3">
          <div className="mt-0.5 rounded-md bg-sky-100 p-2 dark:bg-sky-900/40">
            <Clock className="h-4 w-4 text-sky-700 dark:text-sky-300" />
          </div>
          <div>
            <CardTitle className="text-base">Max: Zeiten der Automatik</CardTitle>
            <CardDescription>
              Wann Max morgens selbstständig arbeitet — Uhrzeiten in deutscher Zeit
            </CardDescription>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {(rows ?? []).map((r) => (
          <div key={r.job_key} className="rounded-lg border p-4">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0 flex-1 space-y-1">
                <Label className="text-sm font-medium">
                  {LABELS[r.job_key] ?? r.jobname}
                </Label>
                {r.beschreibung && (
                  <p className="text-sm text-muted-foreground">{r.beschreibung}</p>
                )}
              </div>

              <div className="flex shrink-0 items-center gap-3">
                <Input
                  type="time"
                  value={times[r.job_key] ?? ''}
                  onChange={(e) =>
                    setTimes((p) => ({ ...p, [r.job_key]: e.target.value }))
                  }
                  disabled={flags[r.job_key] === false}
                  className="w-28"
                />
                <Switch
                  checked={flags[r.job_key] ?? true}
                  onCheckedChange={(v) =>
                    setFlags((p) => ({ ...p, [r.job_key]: v }))
                  }
                />
              </div>
            </div>
          </div>
        ))}

        {reihenfolgeVerletzt && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              <strong>Reihenfolge stimmt nicht:</strong> Der Überfällig-Wächter
              ({times.overdue_watch}) läuft nicht vor der Morgen-Übersicht
              ({times.morning_summary}). Dann fehlen die überfälligen Vorgänge in
              deiner E-Mail. Setze den Wächter auf eine frühere Zeit.
            </AlertDescription>
          </Alert>
        )}

        <Alert>
          <Info className="h-4 w-4" />
          <AlertDescription className="text-sm">
            <strong>Zeitumstellung:</strong> Die Umrechnung geschieht beim
            Speichern. Nach der Umstellung im März und Oktober bitte einmal auf
            „Zeiten übernehmen" klicken — dann stimmen die Uhrzeiten wieder.
          </AlertDescription>
        </Alert>

        <Button
          onClick={() => speichern.mutate()}
          disabled={speichern.isPending || reihenfolgeVerletzt}
          className="w-full"
        >
          {speichern.isPending ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Übernehmen…
            </>
          ) : (
            <>
              <Save className="mr-2 h-4 w-4" />
              Zeiten übernehmen
            </>
          )}
        </Button>
      </CardContent>
    </Card>
  );
};

export default MaxAutomationScheduleCard;
