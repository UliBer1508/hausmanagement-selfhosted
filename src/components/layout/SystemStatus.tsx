// Systemstatus der Hausverwaltung – Symbol in der Kopfleiste + Fenster (23.11.2026).
// Uli: „diesen Systemstatus auch in der Hausverwaltung“, dann (gleicher Tag) bewusst ohne
// Datenbank-Brücke: Die Hausverwaltung zeigt nur, was in IHRER Datenbank steht – die nächtliche
// Sicherung (backup_runs, Ersatz-PC über system_settings.backup_standby). PCs, Dienste und Cloud
// der Heizung bleiben im Systemstatus der Heizungs-App.
// Aussehen wie in der Heizung (smartfox-insight-ai-selfhosted, src/components/layout/SystemStatus.tsx):
// Symbol mit grünem Punkt bzw. „1 Problem“, im Fenster „Alles läuft“ und darunter die Karte
// „Sicherungen“ (SystemBackupsCard.tsx, gleiche Datei in beiden Repos). Rechnung: sicherungKurz()
// in lib/backupStatus.ts. Doku: docs/Datenbank-Sicherung-Supabase.md.
import { useState } from 'react';
import { AlertTriangle, CheckCircle2, RefreshCw, Server } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import useBackupRuns, { useBackupStandby } from '@/hooks/useBackupRuns';
import { useBackupSettings, DEFAULT_BACKUP_SETTINGS } from '@/hooks/useSystemSettings';
import { sicherungKurz } from '@/lib/backupStatus';
import { SystemBackupsCard } from './SystemBackupsCard';

export function SystemStatusButton({ compact }: { compact?: boolean }) {
  const [open, setOpen] = useState(false);
  const { data: runs, isError, isLoading, refetch, dataUpdatedAt } = useBackupRuns(60, 14);
  const { data: standby, refetch: refetchStandby } = useBackupStandby();
  const { data: settings } = useBackupSettings();
  if (isLoading) return null;

  const warn = settings?.warn_after_hours ?? DEFAULT_BACKUP_SETTINGS.warn_after_hours;
  const items = [
    sicherungKurz('Hausverwaltung', isError ? null : runs ?? null, standby ?? null, warn,
      settings?.enabled ?? DEFAULT_BACKUP_SETTINGS.enabled),
  ];
  const problems = items.filter((i) => i.problem).map((i) => i.problem as string);
  const n = problems.length;
  const label = n === 0 ? 'Alles läuft' : n === 1 ? '1 Problem' : `${n} Probleme`;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title={`Systemstatus: ${label}`}
        aria-label={`Systemstatus: ${label}`}
        className={cn(
          'inline-flex items-center gap-1.5 rounded-full border text-[10px] md:text-xs font-medium transition-colors flex-shrink-0',
          compact ? 'h-8 px-2' : 'px-2.5 py-1',
          n === 0
            ? 'border-border text-muted-foreground hover:bg-muted'
            : 'border-red-300 bg-red-50 text-red-700 hover:bg-red-100',
        )}
      >
        <Server className="w-3.5 h-3.5" />
        {n === 0 ? <span className="w-2.5 h-2.5 rounded-full bg-green-500" /> : <span>{compact ? n : label}</span>}
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto p-4 md:p-6">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Server className="w-5 h-5" />Systemstatus</DialogTitle>
            <DialogDescription>Läuft die nächtliche Sicherung der Hausverwaltung?</DialogDescription>
          </DialogHeader>

          {n === 0 ? (
            <div className="flex items-center gap-2 rounded-lg border border-green-300 bg-green-50 px-3 py-2 text-sm text-green-800">
              <CheckCircle2 className="w-4 h-4 flex-shrink-0" /> Alles läuft.
            </div>
          ) : (
            <div className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800 space-y-1">
              {problems.map((t) => (
                <div key={t} className="flex gap-2"><AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" /><span><b>Sicherung:</b> {t}</span></div>
              ))}
            </div>
          )}

          <SystemBackupsCard items={items} />

          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="flex-1">
              Details und Einstellungen: Einstellungen › Datensicherung. PCs, Dienste und Cloud zeigt der
              Systemstatus der Heizungs-App.
              {dataUpdatedAt > 0 && ` Stand ${new Date(dataUpdatedAt).toLocaleTimeString('de-DE')}.`}
            </span>
            <Button variant="outline" size="sm" onClick={() => { refetch(); refetchStandby(); }} className="h-7 gap-1">
              <RefreshCw className="w-3 h-3" />Aktualisieren
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
