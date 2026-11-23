import { requireAdmin } from "../_shared/auth.ts";
import { callBridge, HEIZUNG_URL } from "../_shared/bridge.ts";

/**
 * system-status (23.11.2026) — Systemstatus (PCs, Dienste, Cloud) in der Hausverwaltung.
 * Die Daten liegen in der Heizungs-Datenbank (Dienste-Wächter auf beiden PCs, docs/Systemstatus.md).
 * Diese Function prüft den Admin der Hausverwaltung und reicht an die Heizungs-Function
 * system-bridge weiter (x-bridge-token). Dort gelten dieselben Regeln wie in der Heizungs-App
 * (service_command_allowed: Fernzugriff nur starten, kein doppelter Befehl).
 *   { action: 'status' }                               → problems, hosts, services, commands, cloud, backups (Heizung)
 *   { action: 'command', host, service, action_name }  → Start/Stop/Neustart
 */

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

const HOST_RE = /^[a-z0-9-]{1,40}$/;
const NAME_RE = /^[A-Za-z0-9_.-]{1,80}$/;
const ACTIONS = new Set(['start', 'stop', 'restart']);

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  const authError = await requireAdmin(req, corsHeaders);
  if (authError) return authError;

  try {
    const body = await req.json().catch(() => ({}));
    if (body.action === 'status') {
      return json(await callBridge(`${HEIZUNG_URL}/system-bridge`, { action: 'status' }));
    }
    if (body.action === 'command') {
      const host = String(body.host ?? ''); const service = String(body.service ?? ''); const act = String(body.action_name ?? '');
      if (!HOST_RE.test(host) || !NAME_RE.test(service) || !ACTIONS.has(act)) return json({ error: 'ungültiger Befehl' }, 400);
      return json(await callBridge(`${HEIZUNG_URL}/system-bridge`, { action: 'command', host, service, action_name: act }));
    }
    return json({ error: 'unbekannte Aktion' }, 400);
  } catch (e) {
    console.error('[system-status]', e);
    // 200 mit error-Feld: Die App zeigt die Meldung, statt nur „non-2xx“
    return json({ error: e instanceof Error ? e.message : 'Heizung nicht erreichbar' });
  }
});
