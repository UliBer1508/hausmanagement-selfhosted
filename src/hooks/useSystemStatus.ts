// Systemstatus in der Hausverwaltung (23.11.2026, docs/Systemstatus.md)
// Laufen alle Prozesse – München-PC, Österreich-PC, Cloud? Die Daten liegen in der
// HEIZUNGS-Datenbank (Dienste-Wächter auf beiden PCs). Abruf über die eigene Edge Function
// system-status (nur Admin) → Heizungs-Function system-bridge (x-bridge-token).
// Gleiche Typen wie useSystemStatus im Heizungs-Repo, damit SystemStatus.tsx in beiden Repos
// gleich aussieht. Zusätzlich: remoteBackups = Stand der Heizungs-Sicherung.
// Pollt alle 30 s, solange die Seite sichtbar ist; nach einem Befehl alle 3 s, bis er erledigt ist.
import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { BackupRun, BackupStandby } from '@/lib/backupStatus';

export type ServiceStatus = 'running' | 'stopped' | 'unknown';
export type ServiceControl = 'full' | 'start_only' | 'none';
export type ServiceAction = 'start' | 'stop' | 'restart';

export interface SystemProblem { key: string; area: string; text: string }
export interface SystemHost { host: string; label: string; last_seen: string | null; agent_version: string | null; info: Record<string, unknown> }
export interface SystemService {
  host: string; name: string; label: string; url: string | null;
  kind: 'nssm' | 'extra' | 'web'; control: ServiceControl; status: ServiceStatus;
  status_since: string; detail: string | null; intended_stop: boolean; updated_at: string;
}
export interface ServiceCommand {
  id: string; host: string; service_name: string; action: ServiceAction;
  status: 'pending' | 'running' | 'done' | 'failed' | 'expired'; result: string | null;
  created_at: string; executed_at: string | null;
}
export interface CloudStatus {
  now: string;
  last_energy: string | null;
  tuya: { last_sync: string | null; devices_ok: number | null; devices_configured: number | null } | null;
  open_api_errors: number;
  cron: { jobs: number; runs_24h: number; failed_24h: number; last_run: string | null };
  pv_automation_last: string | null;
  muc: { last_seen: string | null; fenecon_ok: boolean | null; loxone_ok: boolean | null; house_mode: string | null; version: string | null; last_error: string | null } | null;
  net_2h: { ok: number; errors: number; timeouts: number };
}
/** Stand der Sicherung der Heizungs-Datenbank */
export interface RemoteBackups {
  runs: BackupRun[];
  standby: BackupStandby | null;
  settings: { enabled?: boolean; warn_after_hours?: number } | null;
}

export const HOST_STALE_MS = 10 * 60 * 1000; // wie system_problems() in der Heizung

interface StatusPayload {
  error?: string;
  problems?: SystemProblem[]; hosts?: SystemHost[]; services?: SystemService[];
  commands?: ServiceCommand[]; cloud?: CloudStatus | null; backups?: RemoteBackups | null;
}

export function useSystemStatus() {
  const [problems, setProblems] = useState<SystemProblem[]>([]);
  const [hosts, setHosts] = useState<SystemHost[]>([]);
  const [services, setServices] = useState<SystemService[]>([]);
  const [commands, setCommands] = useState<ServiceCommand[]>([]);
  const [cloud, setCloud] = useState<CloudStatus | null>(null);
  const [remoteBackups, setRemoteBackups] = useState<RemoteBackups | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [loadedAt, setLoadedAt] = useState<Date | null>(null);
  const alive = useRef(true);

  const load = useCallback(async () => {
    const { data, error } = await supabase.functions.invoke('system-status', { body: { action: 'status' } });
    if (!alive.current) return;
    // Kein Admin (401/403): Symbol ausblenden statt „1 Problem“ zu zeigen
    const httpStatus = (error as { context?: { status?: number } } | null)?.context?.status;
    if (httpStatus === 401 || httpStatus === 403) { setReady(false); return; }
    setReady(true);
    setLoadedAt(new Date());
    const d = (data ?? null) as StatusPayload | null;
    if (error || !d || d.error) {
      const msg = d?.error ?? error?.message ?? 'Heizung nicht erreichbar';
      console.error('[useSystemStatus]', msg);
      setLoadError(msg);
      return;
    }
    setLoadError(null);
    setProblems(d.problems ?? []);
    setHosts(d.hosts ?? []);
    setServices(d.services ?? []);
    setCommands(d.commands ?? []);
    setCloud(d.cloud ?? null);
    setRemoteBackups(d.backups ?? null);
  }, []);

  const pendingCount = commands.filter((c) => c.status === 'pending' || c.status === 'running').length;

  useEffect(() => {
    alive.current = true;
    load();
    const ms = pendingCount > 0 ? 3_000 : 30_000;
    const t = setInterval(() => { if (document.visibilityState === 'visible') load(); }, ms);
    return () => { alive.current = false; clearInterval(t); };
  }, [load, pendingCount]);

  const sendCommand = useCallback(async (host: string, service: string, action: ServiceAction) => {
    const { data, error } = await supabase.functions.invoke('system-status', {
      body: { action: 'command', host, service, action_name: action },
    });
    await load();
    const msg = (data as { error?: string } | null)?.error ?? (error ? error.message : null);
    if (msg) console.error('[useSystemStatus] Befehl', msg);
    return msg;
  }, [load]);

  return {
    problems, hosts, services, commands, cloud, remoteBackups, loadError,
    isAdmin: true, // die Function lässt nur Admins der Hausverwaltung durch
    ready, loadedAt, reload: load, sendCommand,
  };
}
