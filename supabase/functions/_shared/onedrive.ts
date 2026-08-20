/**
 * _shared/onedrive.ts — Zugriffstoken fuer Microsoft Graph.
 *
 * Wird von allen Graph-nutzenden Edge Functions verwendet.
 * Drei Dinge muss diese Datei richtig machen; jedes davon ist ein
 * bekannter Ausfallgrund solcher Integrationen:
 *
 *  1. Access-Token zwischenspeichern (Gueltigkeit 60-90 Min).
 *  2. Den NEUEN Refresh-Token zurueckschreiben. Microsoft rotiert ihn bei
 *     jedem Refresh. Wer den alten stehen laesst, hat nach Wochen eine
 *     tote Verbindung — der Klassiker, an dem das still stirbt.
 *  3. Nebenlaeufigkeit abfangen. Zwei gleichzeitige Refreshes entwerten
 *     sich gegenseitig den Token -> pg_advisory_xact_lock.
 */

import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.39.7";

const TOKEN_URL = "https://login.microsoftonline.com/consumers/oauth2/v2.0/token";
export const GRAPH = "https://graph.microsoft.com/v1.0";
export const SCOPE = "offline_access Files.ReadWrite User.Read";

export function serviceClient(): SupabaseClient {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
}

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/** Fehler, den die Oberflaeche als „Verbindung erneuern" anzeigen soll. */
export class OneDriveAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OneDriveAuthError";
  }
}

/**
 * Liefert ein gueltiges Zugriffstoken.
 * Wirft OneDriveAuthError, wenn eine Neuanmeldung noetig ist.
 */
export async function getAccessToken(supabase: SupabaseClient): Promise<string> {
  const { data: row, error } = await supabase
    .from("integration_tokens")
    .select("refresh_token, access_token, access_expires_at")
    .eq("provider", "onedrive")
    .maybeSingle();

  if (error) throw new Error(`integration_tokens nicht lesbar: ${error.message}`);
  if (!row) {
    throw new OneDriveAuthError(
      "OneDrive ist nicht verbunden. Bitte die einmalige Anmeldung durchfuehren.",
    );
  }

  // Noch mehr als 5 Minuten gueltig -> gespeichertes Token nehmen.
  if (row.access_token && row.access_expires_at) {
    const restMs = new Date(row.access_expires_at).getTime() - Date.now();
    if (restMs > 5 * 60 * 1000) return row.access_token;
  }

  // Sperre, damit nicht zwei Functions gleichzeitig refreshen.
  // Schlaegt der RPC fehl (Funktion nicht angelegt), wird ohne Sperre
  // weitergemacht — schlechter, aber nicht blockierend.
  await supabase.rpc("lock_onedrive_refresh").catch(() => {});

  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: row.refresh_token,
    client_id: Deno.env.get("MS_CLIENT_ID")!,
    client_secret: Deno.env.get("MS_CLIENT_SECRET")!,
    scope: SCOPE,
  });

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  const json = await res.json();

  if (!res.ok) {
    const code = json?.error ?? "unknown_error";
    await supabase
      .from("integration_tokens")
      .update({ last_error: code, updated_at: new Date().toISOString() })
      .eq("provider", "onedrive");

    if (code === "invalid_grant") {
      throw new OneDriveAuthError(
        "Die OneDrive-Verbindung ist abgelaufen (Passwortwechsel oder entzogene Zustimmung). Bitte neu anmelden.",
      );
    }
    throw new Error(`Token-Refresh fehlgeschlagen: ${code} — ${json?.error_description ?? ""}`);
  }

  const expiresAt = new Date(Date.now() + (json.expires_in ?? 3600) * 1000).toISOString();

  // Punkt 2: neuen Refresh-Token zurueckschreiben.
  await supabase
    .from("integration_tokens")
    .update({
      refresh_token: json.refresh_token ?? row.refresh_token,
      access_token: json.access_token,
      access_expires_at: expiresAt,
      last_error: null,
      updated_at: new Date().toISOString(),
    })
    .eq("provider", "onedrive");

  return json.access_token as string;
}

/** Graph-Aufruf mit Token und Fehlerauswertung im Klartext. */
export async function graph(
  token: string,
  path: string,
  init: RequestInit = {},
): Promise<any> {
  const res = await fetch(path.startsWith("http") ? path : `${GRAPH}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });

  if (res.status === 204) return null;

  const text = await res.text();
  const json = text ? JSON.parse(text) : null;

  if (!res.ok) {
    const msg = json?.error?.message ?? res.statusText;
    throw new Error(`Graph ${res.status}: ${msg}`);
  }
  return json;
}

/**
 * Legt einen Pfad wie "Venedigersiedlung/Reinigung" an, soweit noetig,
 * und liefert die item_id des letzten Ordners.
 * Bestehende Ordner werden wiederverwendet, nicht dupliziert.
 */
export async function ensureFolderPath(token: string, path: string): Promise<string> {
  const segments = path.split("/").map((s) => s.trim()).filter(Boolean);
  let parentId = "root";

  for (const seg of segments) {
    const children = await graph(
      token,
      `/me/drive/items/${parentId}/children?$select=id,name,folder&$top=999`,
    );
    const hit = (children?.value ?? []).find(
      (c: any) => c.folder && c.name.toLowerCase() === seg.toLowerCase(),
    );

    if (hit) {
      parentId = hit.id;
      continue;
    }

    const created = await graph(token, `/me/drive/items/${parentId}/children`, {
      method: "POST",
      body: JSON.stringify({
        name: seg,
        folder: {},
        "@microsoft.graph.conflictBehavior": "fail",
      }),
    });
    parentId = created.id;
  }

  return parentId;
}
