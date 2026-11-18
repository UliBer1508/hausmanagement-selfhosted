/**
 * rental-portal — öffentliche Schnittstelle „Wohnen auf Zeit“ (NEU 18.11.2026, SQL 72/73).
 *
 * Wird von der Website steinbockchalets.com (Kunde, NICHT angemeldet) und von DB-Triggern
 * (pg_net) aufgerufen. Deshalb verify_jwt = false; die Berechtigung ergibt sich aus dem
 * Angebots-Token (64 Zeichen Zufall) bzw. — bei notify — daraus, dass nur bestehende,
 * noch nicht gemeldete Zeilen gemeldet werden.
 *
 * Aktionen:
 *   notify            {kind: inquiry|response|application, id}  → E-Mail an Uli, je Ereignis einmal
 *   submitApplication {token, data}                             → Selbstauskunft speichern
 *   uploadSession     {token, kind, fileName, size}             → Upload-Adresse (OneDrive)
 *   uploadComplete    {token, kind, itemId}                     → Dokument registrieren + verknüpfen
 *
 * Unterlagen landen in der Dokumentenverwaltung: Typ „Mieterunterlagen“, Ordner
 *   <Ablageort des Hauses für Mieterunterlagen>/<Name (Datum)>
 * bzw. ohne festgelegten Ablageort DokumentManagement/<Hausordner>/Mieterunterlagen/<Name (Datum)>.
 * Der OneDrive-Token verlässt die Function nie (wie onedrive-api).
 *
 * SICHERHEIT:
 *   - Uploads nur für freigegebene Angebote (nicht Entwurf/zurückgezogen); nach Ablauf nur
 *     noch, wenn angenommen. Höchstens MAX_DATEIEN je Angebot, MAX_BYTES je Datei, nur
 *     PDF/Bilder.
 *   - uploadComplete registriert nur Dateien, die im Ordner DIESES Angebots liegen.
 *   - Mails gehen ausschließlich an EMPFAENGER — nie an eine Adresse aus dem Request.
 *   - Keine Personendaten in Logs.
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import {
  corsHeaders,
  serviceClient,
  getAccessToken,
  graph,
  ensureFolderPath,
  OneDriveAuthError,
} from "../_shared/onedrive.ts";

const EMPFAENGER = "steinbockchalets@gmail.com";
const APP_URL = "https://hausmanagement.steinbockchalets-charge.com";
const MAX_DATEIEN = 15;
const MAX_BYTES = 20 * 1024 * 1024;
const ENDUNGEN = ["pdf", "jpg", "jpeg", "png", "heic", "heif", "webp"];
const ARTEN: Record<string, string> = {
  id: "Ausweis",
  income: "Einkommensnachweis",
  self: "Selbstauskunft",
  other: "Sonstiges",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

// Pfadtrenner und in OneDrive verbotene Zeichen entfernen
const sauber = (s: string) => s.replace(/[\\/:*?"<>|#%]/g, " ").replace(/\s+/g, " ").trim().slice(0, 80);

const datumDE = (iso: string | null | undefined) => {
  if (!iso) return "–";
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}.${m}.${y}`;
};

const euro = (n: number | null | undefined) =>
  new Intl.NumberFormat("de-AT", { style: "currency", currency: "EUR" }).format(Number(n ?? 0));

type Sb = ReturnType<typeof serviceClient>;

/** Angebot zum Token, das der Kunde sehen darf (wie get_rental_offer). */
async function angebotZuToken(sb: Sb, token: unknown) {
  if (typeof token !== "string" || token.length < 32) return null;
  const { data } = await sb
    .from("rental_offers")
    .select("*, houses(id, name)")
    .eq("token", token)
    .in("status", ["released", "viewed", "accepted", "question"])
    .maybeSingle();
  return data;
}

const darfHochladen = (o: any) =>
  o.status === "accepted" || o.valid_until >= new Date().toISOString().slice(0, 10);

/** Ordner für die Unterlagen dieses Angebots; legt ihn an, merkt den Ablageort des Hauses. */
async function unterlagenOrdner(sb: Sb, token: string, o: any): Promise<{ folderId: string; path: string; typeId: string }> {
  const { data: typ } = await sb.from("document_types").select("id").ilike("name", "mieterunterlagen").maybeSingle();
  if (!typ) throw new Error("Dokumenttyp Mieterunterlagen fehlt (SQL 73).");

  const { data: ort } = await sb
    .from("document_locations")
    .select("onedrive_path")
    .eq("entity_type", "haus").eq("entity_id", o.house_id).eq("document_type_id", typ.id)
    .maybeSingle();

  let basis: string;
  if (ort?.onedrive_path) {
    basis = ort.onedrive_path;
  } else {
    // Hausordner aus einem anderen Ablageort des Hauses ableiten („DokumentManagement / Venediger / …“)
    const { data: andere } = await sb
      .from("document_locations").select("onedrive_path")
      .eq("entity_type", "haus").eq("entity_id", o.house_id);
    const treffer = (andere ?? [])
      .map((a: any) => String(a.onedrive_path ?? "").split("/").map((s) => s.trim()))
      .find((teile: string[]) => teile[0]?.toLowerCase() === "dokumentmanagement" && teile[1]);
    const hausOrdner = treffer ? treffer[1] : sauber(o.houses?.name ?? "Haus");
    basis = `DokumentManagement / ${hausOrdner} / Mieterunterlagen`;
    const basisId = await ensureFolderPath(token, basis);
    // Ablageort merken, damit „Dokumente“ in der Hausverwaltung denselben Ordner vorschlägt
    await sb.from("document_locations").upsert(
      { entity_type: "haus", entity_id: o.house_id, document_type_id: typ.id, onedrive_item_id: basisId, onedrive_path: basis },
      { onConflict: "entity_type,entity_id,document_type_id" },
    );
  }

  const unter = sauber(`${o.guest_name} (${String(o.created_at).slice(0, 10)})`);
  const path = `${basis} / ${unter}`;
  const folderId = await ensureFolderPath(token, path);
  return { folderId, path, typeId: typ.id };
}

async function mail(sb: Sb, betreff: string, text: string) {
  const { data, error } = await sb.functions.invoke("send-guest-email", {
    body: { recipients: [{ email: EMPFAENGER }], subjectTemplate: betreff, bodyTemplate: text },
  });
  if (error || (data && data.sent !== 1)) {
    throw new Error(`Mail fehlgeschlagen: ${error ? String(error) : JSON.stringify(data?.failed ?? data)}`);
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  let action = "";
  try {
    const p = await req.json();
    action = p.action ?? "";
    const sb = serviceClient();

    // ---- E-Mail an Uli (von den DB-Triggern) ---------------------------------
    if (action === "notify") {
      const { kind, id } = p;
      if (typeof id !== "string") return json({ error: "id fehlt" }, 400);

      if (kind === "inquiry") {
        const { data: a } = await sb.from("rental_inquiries").select("*, houses(name)").eq("id", id).maybeSingle();
        if (!a || a.notified_at) return json({ skipped: true });
        await mail(sb, `Neue Mietanfrage Wohnen auf Zeit – ${a.houses?.name ?? ""}`, [
          `Neue Mietanfrage über steinbockchalets.com`,
          ``,
          `Haus: ${a.houses?.name ?? "–"}`,
          `Name: ${a.guest_name}`,
          `E-Mail: ${a.guest_email}`,
          `Telefon: ${a.guest_phone}`,
          `Einzug: ${datumDE(a.move_in)}`,
          `Dauer: ${a.duration_months ? `${a.duration_months} Monate` : "länger / offen"}`,
          `Personen: ${a.persons}${a.pets ? " (mit Haustier)" : ""}`,
          `Anlass: ${a.purpose ?? "–"}${a.purpose_detail ? ` – ${a.purpose_detail}` : ""}`,
          `Anmeldung Gemeinde zugesagt: ${a.registration_confirmed ? "ja" : "nein"}`,
          a.message ? `\nNachricht:\n${a.message}` : ``,
          ``,
          `Hausverwaltung → Mieter → Interessenten: ${APP_URL}`,
        ].join("\n"));
        await sb.from("rental_inquiries").update({ notified_at: new Date().toISOString() }).eq("id", id);
        return json({ sent: true });
      }

      if (kind === "response") {
        const { data: o } = await sb.from("rental_offers").select("*, houses(name)").eq("id", id).maybeSingle();
        if (!o || !o.responded_at) return json({ skipped: true });
        if (o.response_notified_at && o.response_notified_at >= o.responded_at) return json({ skipped: true });
        const angenommen = o.status === "accepted";
        await mail(sb, `${angenommen ? "Angebot ANGENOMMEN" : "Rückfrage zum Angebot"} – ${o.guest_name}, ${o.houses?.name ?? ""}`, [
          angenommen ? `${o.guest_name} hat das Angebot angenommen.` : `${o.guest_name} hat eine Rückfrage zum Angebot.`,
          ``,
          `Haus: ${o.houses?.name ?? "–"}`,
          `Miete: ${euro(o.rent_month)} + Nebenkosten ${euro(o.utilities_month)} · Kaution ${euro(o.deposit)}`,
          `Einzug: ${datumDE(o.move_in)} · Dauer: ${o.duration_months ? `${o.duration_months} Monate` : "offen"}`,
          o.guest_message ? `\nNachricht des Kunden:\n${o.guest_message}` : ``,
          ``,
          angenommen ? `Nächste Schritte: Selbstauskunft/Unterlagen abwarten, Mietvertrag, dann „Als Mieter übernehmen“.` : ``,
          `Hausverwaltung → Mieter → Interessenten: ${APP_URL}`,
        ].join("\n"));
        await sb.from("rental_offers").update({ response_notified_at: new Date().toISOString() }).eq("id", id);
        return json({ sent: true });
      }

      if (kind === "application") {
        const { data: s } = await sb.from("rental_applications").select("*, rental_offers(guest_name, houses(name))").eq("id", id).maybeSingle();
        if (!s || s.notified_at) return json({ skipped: true });
        await mail(sb, `Selbstauskunft eingegangen – ${s.full_name}`, [
          `${s.full_name} hat die Selbstauskunft ausgefüllt (${s.rental_offers?.houses?.name ?? ""}).`,
          `Unterlagen und Angaben: Hausverwaltung → Mieter → Interessenten → Angebot öffnen.`,
          APP_URL,
        ].join("\n"));
        await sb.from("rental_applications").update({ notified_at: new Date().toISOString() }).eq("id", id);
        return json({ sent: true });
      }

      return json({ error: "unbekannte Art" }, 400);
    }

    // ---- ab hier: Kunde mit Angebots-Token -----------------------------------
    const o = await angebotZuToken(sb, p.token);
    if (!o) return json({ error: "not_found" }, 404);

    if (action === "submitApplication") {
      const d = p.data ?? {};
      const txt = (v: unknown, max: number) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null);
      const zahl = (v: unknown) => (v === null || v === undefined || v === "" || isNaN(Number(v)) ? null : Number(v));
      if (!txt(d.full_name, 120) || d.consent_privacy !== true) return json({ error: "invalid" }, 400);
      const zeile = {
        offer_id: o.id,
        full_name: txt(d.full_name, 120),
        birth_date: /^\d{4}-\d{2}-\d{2}$/.test(String(d.birth_date ?? "")) ? d.birth_date : null,
        current_address: txt(d.current_address, 300),
        occupation: txt(d.occupation, 120),
        employer: txt(d.employer, 160),
        employed_since: txt(d.employed_since, 40),
        net_income_month: zahl(d.net_income_month),
        adults: zahl(d.adults),
        children: zahl(d.children),
        pets: txt(d.pets, 200),
        previous_landlord: txt(d.previous_landlord, 200),
        no_debt_enforcement: d.no_debt_enforcement === true,
        consent_privacy: true,
        remarks: txt(d.remarks, 2000),
      };
      // Eine Selbstauskunft je Angebot; erneutes Absenden überschreibt (Korrektur durch den Kunden).
      const { error } = await sb.from("rental_applications").upsert(zeile, { onConflict: "offer_id" });
      if (error) throw error;
      return json({ ok: true });
    }

    if (action === "uploadSession" || action === "uploadComplete") {
      if (!darfHochladen(o)) return json({ error: "expired" }, 403);
      const art = ARTEN[p.kind] ? p.kind : "other";
      const token = await getAccessToken(sb);
      const ordner = await unterlagenOrdner(sb, token, o);

      if (action === "uploadSession") {
        const name = String(p.fileName ?? "");
        const endung = name.split(".").pop()?.toLowerCase() ?? "";
        if (!ENDUNGEN.includes(endung)) return json({ error: "type" }, 400);
        if (!(Number(p.size) > 0) || Number(p.size) > MAX_BYTES) return json({ error: "size" }, 400);
        const { count } = await sb.from("document_links").select("id", { count: "exact", head: true })
          .eq("entity_type", "mietangebot").eq("entity_id", o.id);
        if ((count ?? 0) >= MAX_DATEIEN) return json({ error: "too_many" }, 400);

        const dateiname = `${ARTEN[art]} - ${sauber(o.guest_name)} - ${sauber(name.replace(/\.[^.]+$/, ""))}.${endung}`;
        const session = await graph(
          token,
          `/me/drive/items/${ordner.folderId}:/${encodeURIComponent(dateiname)}:/createUploadSession`,
          { method: "POST", body: JSON.stringify({ item: { "@microsoft.graph.conflictBehavior": "rename", name: dateiname } }) },
        );
        return json({ uploadUrl: session.uploadUrl });
      }

      // uploadComplete
      const itemId = String(p.itemId ?? "");
      if (!itemId) return json({ error: "itemId fehlt" }, 400);
      const item = await graph(token, `/me/drive/items/${itemId}?$select=id,name,size,webUrl,file,parentReference`);
      if (item?.parentReference?.id !== ordner.folderId) return json({ error: "wrong_folder" }, 403);

      const { data: dok, error: e1 } = await sb.from("documents").insert({
        file_name: item.name,
        mime_type: item.file?.mimeType ?? null,
        size_bytes: item.size ?? null,
        document_type_id: ordner.typeId,
        house_id: o.house_id,
        onedrive_item_id: item.id,
        onedrive_drive_id: item.parentReference?.driveId ?? null,
        onedrive_web_url: item.webUrl,
        onedrive_path: ordner.path,
        note: `${ARTEN[art]} – Mietinteressent ${o.guest_name} (Wohnen auf Zeit, vom Kunden hochgeladen)`,
      }).select("id").single();
      if (e1) throw e1;
      const { error: e2 } = await sb.from("document_links").insert({
        document_id: dok.id, entity_type: "mietangebot", entity_id: o.id, position: 2,
      });
      if (e2) throw e2;
      return json({ ok: true });
    }

    return json({ error: `Unbekannte Aktion: ${action}` }, 400);
  } catch (e) {
    console.error(`rental-portal [${action}]:`, e instanceof Error ? e.message : String(e));
    if (e instanceof OneDriveAuthError) return json({ error: "storage_unavailable" }, 503);
    return json({ error: "server" }, 500);
  }
});
