/**
 * onedrive-oauth — einmalige Anmeldung bei Microsoft.
 *
 * verify_jwt = false, weil Microsoft ohne JWT zurueckruft.
 * Zwei Pfade in einer Function:
 *   a) Aufruf ohne ?code -> Weiterleitung zur Microsoft-Anmeldung
 *   b) Aufruf mit  ?code -> Token holen und in integration_tokens ablegen
 *
 * Wirkung: Der Refresh-Token taucht in keinem Chat, keiner Datei und
 * keiner Zwischenablage auf.
 *
 * Die redirect_uri muss ZEICHENGENAU mit der in der App-Registrierung
 * hinterlegten uebereinstimmen, sonst AADSTS50011.
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { serviceClient, SCOPE } from "../_shared/onedrive.ts";

const AUTH_URL = "https://login.microsoftonline.com/consumers/oauth2/v2.0/authorize";
const TOKEN_URL = "https://login.microsoftonline.com/consumers/oauth2/v2.0/token";

const page = (title: string, body: string, ok: boolean) =>
  new Response(
    `<!doctype html><html lang="de"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title}</title>
<style>
 body{font-family:system-ui,sans-serif;background:#f8fafc;margin:0;
      display:flex;align-items:center;justify-content:center;min-height:100vh;padding:24px}
 .card{background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:28px 32px;max-width:460px}
 h1{font-size:18px;font-weight:500;margin:0 0 8px;color:${ok ? "#065f46" : "#991b1b"}}
 p{font-size:14px;color:#475569;margin:0;line-height:1.6}
 code{font-family:ui-monospace,monospace;font-size:13px;background:#f1f5f9;padding:2px 5px;border-radius:4px}
</style></head><body><div class="card"><h1>${title}</h1><p>${body}</p></div></body></html>`,
    { status: ok ? 200 : 400, headers: { "Content-Type": "text/html; charset=utf-8" } },
  );

serve(async (req) => {
  const url = new URL(req.url);
  const redirectUri = `${url.origin}${url.pathname}`;
  const clientId = Deno.env.get("MS_CLIENT_ID");
  const clientSecret = Deno.env.get("MS_CLIENT_SECRET");

  if (!clientId || !clientSecret) {
    return page(
      "Nicht eingerichtet",
      "Die Secrets <code>MS_CLIENT_ID</code> und <code>MS_CLIENT_SECRET</code> sind nicht gesetzt.",
      false,
    );
  }

  // ---- Pruefmodus: zeigt, was tatsaechlich an Microsoft ginge ---------
  // Aufruf mit ?debug=1. Leitet NICHT weiter, sondern gibt die Werte aus.
  // Hintergrund: die redirect_uri wird zur Laufzeit aus der aufgerufenen
  // Adresse gebaut. Weicht sie von der registrierten ab, meldet Microsoft
  // invalid_request — ohne zu sagen, welche Zeichenkette es erwartet hat.
  if (url.searchParams.get("debug") === "1") {
    const authUrl = new URL(AUTH_URL);
    authUrl.searchParams.set("client_id", clientId);
    authUrl.searchParams.set("response_type", "code");
    authUrl.searchParams.set("response_mode", "query");
    authUrl.searchParams.set("redirect_uri", redirectUri);
    authUrl.searchParams.set("scope", SCOPE);
    authUrl.searchParams.set("state", "debug");

    return new Response(
      JSON.stringify({
        redirect_uri: redirectUri,
        redirect_uri_laenge: redirectUri.length,
        url_origin: url.origin,
        url_pathname: url.pathname,
        url_href: url.href,
        client_id: clientId,
        client_id_laenge: clientId.length,
        scope: SCOPE,
        vollstaendige_anmelde_url: authUrl.toString(),
        header_host: req.headers.get("host"),
        header_x_forwarded_host: req.headers.get("x-forwarded-host"),
        header_x_forwarded_proto: req.headers.get("x-forwarded-proto"),
      }, null, 2),
      { headers: { "Content-Type": "application/json; charset=utf-8" } },
    );
  }

  const code = url.searchParams.get("code");
  const err = url.searchParams.get("error");

  if (err) {
    return page(
      "Anmeldung abgebrochen",
      `Microsoft meldet: <code>${err}</code> — ${url.searchParams.get("error_description") ?? ""}`,
      false,
    );
  }

  // ---- a) Start: zu Microsoft weiterleiten ----------------------------
  if (!code) {
    const state = crypto.randomUUID();
    const target = new URL(AUTH_URL);
    target.searchParams.set("client_id", clientId);
    target.searchParams.set("response_type", "code");
    target.searchParams.set("response_mode", "query");
    target.searchParams.set("redirect_uri", redirectUri);
    target.searchParams.set("scope", SCOPE);
    target.searchParams.set("state", state);
    target.searchParams.set("prompt", "consent");

    return new Response(null, {
      status: 302,
      headers: {
        Location: target.toString(),
        // state im Cookie, damit der Rueckruf geprueft werden kann
        "Set-Cookie": `od_state=${state}; Path=/; Max-Age=600; HttpOnly; Secure; SameSite=Lax`,
      },
    });
  }

  // ---- b) Rueckruf: state pruefen -------------------------------------
  const cookie = req.headers.get("cookie") ?? "";
  const expected = cookie.match(/od_state=([^;]+)/)?.[1];
  const got = url.searchParams.get("state");

  if (!expected || expected !== got) {
    return page(
      "Anmeldung nicht bestaetigt",
      "Die Sitzungspruefung ist fehlgeschlagen. Bitte den Vorgang von vorn beginnen.",
      false,
    );
  }

  // ---- Token holen ------------------------------------------------------
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
      client_id: clientId,
      client_secret: clientSecret,
      scope: SCOPE,
    }),
  });

  const json = await res.json();
  if (!res.ok) {
    return page(
      "Token konnte nicht geholt werden",
      `<code>${json?.error ?? "unknown"}</code> — ${json?.error_description ?? ""}`,
      false,
    );
  }

  // Wer ist verbunden? Nur zur Anzeige.
  let label = "unbekannt";
  try {
    const me = await fetch("https://graph.microsoft.com/v1.0/me", {
      headers: { Authorization: `Bearer ${json.access_token}` },
    }).then((r) => r.json());
    label = me?.userPrincipalName ?? me?.mail ?? me?.displayName ?? "unbekannt";
  } catch { /* Anzeige ist nicht kritisch */ }

  const supabase = serviceClient();
  const { error } = await supabase.from("integration_tokens").upsert(
    {
      provider: "onedrive",
      refresh_token: json.refresh_token,
      access_token: json.access_token,
      access_expires_at: new Date(Date.now() + (json.expires_in ?? 3600) * 1000).toISOString(),
      account_label: label,
      last_error: null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "provider" },
  );

  if (error) {
    return page("Speichern fehlgeschlagen", `Datenbank: <code>${error.message}</code>`, false);
  }

  return page(
    "Verbunden",
    `OneDrive ist mit <code>${label}</code> verbunden. Dieses Fenster kann geschlossen werden.`,
    true,
  );
});
