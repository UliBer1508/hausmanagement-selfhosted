import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";
import { requireAdmin } from "../_shared/auth.ts";

// AirROI-Abfrage von Hand (NEU 13.09.2026)
//
// ZWECK: Auf Ulis Wunsch werden AirROI-Abfragen NICHT automatisch ausgeführt,
// sondern einzeln per Knopfdruck - jeder Aufruf kostet echtes Geld. Bedienung
// über Einstellungen -> "AirROI Abfrage (manuell)"
// (src/components/Settings/AirROIQueryCard.tsx).
//
// ABGRENZUNG zu airroi-sync: Diese Funktion SCHREIBT NICHTS in die Datenbank.
// Sie ruft ab und berichtet. Das Übernehmen gefundener Objekte passiert
// bewusst erst auf Knopfdruck in der Oberfläche, damit ein Abfragelauf nie
// versehentlich Daten verändert.
//
// KOSTEN (Standard-Tarif laut https://www.airroi.com/api/pricing,
// Stand 12.09.2026). AirROI ist Pay-as-you-go mit Guthaben; es gibt KEINE
// Tarifstufen, die Endpunkte sperren. Ein Fehlschlag heißt daher: Key ungültig,
// Guthaben leer, oder keine Daten in der Region - diese drei Fälle werden
// unten getrennt ausgewiesen.
//
// WICHTIG: airroi-sync nutzt nur /markets/summary und /markets/metrics/all
// (Marktaggregate, grobe Auflösung, siehe CODE-INDEX.md Modul 12). Die hier
// genutzten Listing-Endpunkte liefern objektgenaue Vergleichsobjekte inklusive
// Reinigungsgebühr und künftiger Tagespreise.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const BASE = "https://api.airroi.com";

/** Standard-Tarif in USD. Muss mit AIRROI_COSTS im Frontend übereinstimmen. */
const KOSTEN: Record<string, number> = {
  market_search: 0.01,
  comparables: 0.10,
  future_rates: 0.10, // PRO Objekt
  radius_search: 0.50,
};

type Schritt = "market_search" | "comparables" | "future_rates" | "radius_search";

interface SchrittErgebnis {
  schritt: Schritt;
  endpunkt: string;
  kosten_usd: number;
  http_status: number | null;
  ok: boolean;
  befund: string;
  daten?: unknown;
}

function deuteStatus(status: number, bodyText: string): string {
  if (status === 200) return "OK";
  if (status === 401 || status === 403) return "Key ungültig oder nicht aktiviert (401/403)";
  if (status === 402) return "Guthaben aufgebraucht (402) - im AirROI-Dashboard aufladen";
  if (status === 404) return "Nichts gefunden (404) - Parameter oder Region prüfen";
  if (status === 429) return "Rate Limit erreicht (429)";
  const hinweis = bodyText.slice(0, 200);
  return `HTTP ${status}${hinweis ? ` - ${hinweis}` : ""}`;
}

function statistik(werte: number[]) {
  const sauber = werte.filter((n) => Number.isFinite(n) && n > 0).sort((a, b) => a - b);
  if (sauber.length === 0) return null;
  const summe = sauber.reduce((a, b) => a + b, 0);
  return {
    anzahl: sauber.length,
    min: Math.round(sauber[0] * 100) / 100,
    median: Math.round(sauber[Math.floor(sauber.length / 2)] * 100) / 100,
    max: Math.round(sauber[sauber.length - 1] * 100) / 100,
    durchschnitt: Math.round((summe / sauber.length) * 100) / 100,
  };
}

/** Reduziert ein AirROI-Listing auf das, was die Oberfläche und das Übernehmen braucht. */
function kompakt(l: any) {
  return {
    listing_id: l?.listing_info?.listing_id ?? null,
    name: l?.listing_info?.listing_name ?? null,
    typ: l?.listing_info?.listing_type ?? null,
    // Eignungsmerkmale: Uli entscheidet damit, ob ein Objekt wirklich
    // vergleichbar ist (Apartment vs. Chalet, Ausstattung, Niveau).
    objektart: l?.property_details?.property_type ?? l?.listing_info?.property_type ?? null,
    zimmer: l?.property_details?.bedrooms ?? null,
    flaeche: l?.property_details?.square_feet ?? null,
    ausstattung: Array.isArray(l?.amenities) ? l.amenities.slice(0, 40) : null,
    url: l?.listing_info?.listing_url
      ?? (l?.listing_info?.listing_id ? `https://www.airbnb.com/rooms/${l.listing_info.listing_id}` : null),
    schlafzimmer: l?.property_details?.bedrooms ?? null,
    baeder: l?.property_details?.baths ?? null,
    gaeste: l?.property_details?.guests ?? null,
    waehrung: l?.pricing_info?.currency ?? null,
    reinigungsgebuehr: l?.pricing_info?.cleaning_fee ?? null,
    zusatzgast_gebuehr: l?.pricing_info?.extra_guest_fee ?? null,
    adr_12monate: l?.performance_metrics?.ttm_avg_rate ?? null,
    auslastung_12monate: l?.performance_metrics?.ttm_occupancy ?? null,
    adr_90tage: l?.performance_metrics?.l90d_avg_rate ?? null,
    bewertung: l?.ratings?.rating_overall ?? null,
    bewertungen: l?.ratings?.num_reviews ?? null,
    ort: l?.location_info?.locality ?? null,
    // exact_location=false: Airbnb verschleiert die Lage, Entfernung nur ungefähr.
    genaue_lage: l?.location_info?.exact_location ?? null,
    superhost: l?.host_info?.superhost ?? null,
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  // Jeder Lauf kostet Geld -> nur für Admins.
  const authFehler = await requireAdmin(req, corsHeaders);
  if (authFehler) return authFehler;

  const schritte: SchrittErgebnis[] = [];
  const antwort = (inhalt: unknown, status = 200) =>
    new Response(JSON.stringify(inhalt, null, 2), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  try {
    const apiKey = Deno.env.get("AIRROI_API_KEY");
    if (!apiKey) {
      return antwort({
        ergebnis: "ABBRUCH",
        befund: "AIRROI_API_KEY ist in den Edge-Function-Secrets nicht gesetzt.",
        kosten_usd: 0,
        schritte,
      });
    }

    const body = await req.json().catch(() => ({}));
    const gewaehlt: Schritt[] = Array.isArray(body.steps) && body.steps.length > 0
      ? body.steps
      : ["market_search"];
    const will = (s: Schritt) => gewaehlt.includes(s);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    // --- Objektdaten ------------------------------------------------------
    // Pflichtfelder für /listings/comparables: bedrooms, baths, guests.
    // houses hat bedrooms, bathrooms, max_guests, address (Schema geprüft).
    let address: string | null = body.address ?? null;
    let bedrooms: number | null = body.bedrooms ?? null;
    let baths: number | null = body.baths ?? null;
    let guests: number | null = body.guests ?? null;
    let hausName: string | null = null;

    if (body.house_id) {
      const { data: haus } = await supabase
        .from("houses")
        .select("name, address, bedrooms, bathrooms, max_guests")
        .eq("id", body.house_id)
        .maybeSingle();
      if (haus) {
        hausName = haus.name;
        address = address ?? haus.address;
        bedrooms = bedrooms ?? haus.bedrooms;
        baths = baths ?? haus.bathrooms;
        guests = guests ?? haus.max_guests;
      }
    }

    // Marktbezeichnung aus derselben Quelle wie airroi-sync
    const { data: cfgZeile } = await supabase
      .from("system_settings")
      .select("value")
      .eq("key", "pricing_config")
      .maybeSingle();
    const cfg = (cfgZeile?.value as Record<string, unknown>) ?? {};
    const locality = String(cfg.airroi_locality ?? "").trim();
    const district = String(cfg.airroi_district ?? "").trim();
    const marktBegriff = String(body.market_query ?? (district || locality) ?? "").trim();

    let vergleichsobjekte: any[] = [];

    // --- market_search (0,01 $) ------------------------------------------
    // Billigster Aufruf. Dient als Key-/Guthaben-Test, bevor teurere laufen.
    if (will("market_search")) {
      if (!marktBegriff) {
        schritte.push({
          schritt: "market_search",
          endpunkt: "GET /markets/search",
          kosten_usd: 0,
          http_status: null,
          ok: false,
          befund:
            "Übersprungen: kein Marktbegriff. Weder airroi_district/airroi_locality in pricing_config noch market_query im Aufruf.",
        });
      } else {
        const res = await fetch(
          `${BASE}/markets/search?query=${encodeURIComponent(marktBegriff)}`,
          { headers: { "x-api-key": apiKey } },
        );
        const text = await res.text();
        let daten: any = null;
        try { daten = JSON.parse(text); } catch { /* kein JSON */ }
        schritte.push({
          schritt: "market_search",
          endpunkt: "GET /markets/search",
          kosten_usd: KOSTEN.market_search,
          http_status: res.status,
          ok: res.status === 200,
          befund: deuteStatus(res.status, text),
          daten: daten?.entries
            ? daten.entries.slice(0, 5).map((e: any) => ({
                markt: e.full_name,
                waehrung: e.native_currency,
                aktive_inserate: e.active_listings_count,
              }))
            : text.slice(0, 300),
        });

        // Harter Stopp: Key/Guthaben kaputt -> teure Aufrufe gar nicht erst.
        if (res.status !== 200) {
          return antwort({
            ergebnis: "ABBRUCH",
            befund:
              "Der 1-Cent-Aufruf war nicht erfolgreich. Teurere Endpunkte wurden bewusst NICHT aufgerufen, um kein Guthaben zu verbrennen.",
            hinweis: "Guthaben prüfen: https://www.airroi.com/api/developer",
            kosten_usd: KOSTEN.market_search,
            geprueft_fuer: { haus: hausName, address, markt: marktBegriff },
            schritte,
          });
        }
      }
    }

    // --- comparables (0,10 $) --------------------------------------------
    if (will("comparables")) {
      if (!address || bedrooms == null || baths == null || guests == null) {
        schritte.push({
          schritt: "comparables",
          endpunkt: "GET /listings/comparables",
          kosten_usd: 0,
          http_status: null,
          ok: false,
          befund:
            "Übersprungen: address, bedrooms, baths und guests müssen bekannt sein. Haus auswählen oder Werte direkt mitgeben.",
        });
      } else {
        // Radius bewusst hoch: die AirROI-Doku empfiehlt das ausdrücklich für
        // ländliche Gegenden. Maximum laut Doku 10 Meilen.
        const radius = Math.min(10, Math.max(1, Number(body.radius ?? 10)));
        const params = new URLSearchParams({
          address,
          bedrooms: String(bedrooms),
          baths: String(baths),
          guests: String(guests),
          radius: String(radius),
          currency: "native",
        });
        // entire_home verhindert, dass Einzelzimmer als schwache
        // Vergleichsobjekte auftauchen (Empfehlung aus der Doku).
        if (body.room_type !== "alle") params.set("room_type", "entire_home");

        const res = await fetch(`${BASE}/listings/comparables?${params}`, {
          headers: { "x-api-key": apiKey },
        });
        const text = await res.text();
        let daten: any = null;
        try { daten = JSON.parse(text); } catch { /* kein JSON */ }
        vergleichsobjekte = daten?.listings ?? [];

        schritte.push({
          schritt: "comparables",
          endpunkt: "GET /listings/comparables",
          kosten_usd: KOSTEN.comparables,
          http_status: res.status,
          ok: res.status === 200 && vergleichsobjekte.length > 0,
          befund:
            res.status !== 200
              ? deuteStatus(res.status, text)
              : vergleichsobjekte.length === 0
              ? `Keine Vergleichsobjekte im Umkreis von ${radius} Meilen. Radius erhöhen oder Zimmertyp öffnen.`
              : `${vergleichsobjekte.length} Vergleichsobjekte gefunden.`,
          daten: {
            anzahl: vergleichsobjekte.length,
            radius_meilen: radius,
            adr_pro_nacht: statistik(vergleichsobjekte.map((l) => l?.performance_metrics?.ttm_avg_rate)),
            reinigungsgebuehr: statistik(vergleichsobjekte.map((l) => l?.pricing_info?.cleaning_fee)),
            auslastung_prozent: statistik(
              vergleichsobjekte.map((l) => (l?.performance_metrics?.ttm_occupancy ?? 0) * 100),
            ),
            mit_genauer_lage: vergleichsobjekte.filter((l) => l?.location_info?.exact_location).length,
            objekte: vergleichsobjekte.map(kompakt),
            // Erstes Objekt unveraendert. Das AirROI-Antwortschema ist
            // oeffentlich nicht vollstaendig dokumentiert - so ist nach dem
            // ersten Lauf belegt, welche Felder es wirklich gibt, statt dass
            // wir Feldnamen raten. Kostet nichts extra.
            rohdaten_erstes_objekt: vergleichsobjekte[0] ?? null,
          },
        });
      }
    }

    // --- future_rates (0,10 $ PRO Objekt) ---------------------------------
    // Künftige Tagespreise: genau das, was der gescheiterte Scraper liefern
    // sollte. Anzahl wird bewusst gedeckelt, weil jeder Aufruf kostet.
    if (will("future_rates")) {
      const explizit: number[] = Array.isArray(body.listing_ids) ? body.listing_ids : [];
      const ausVergleich = vergleichsobjekte
        .map((l) => l?.listing_info?.listing_id)
        .filter((id: unknown): id is number => typeof id === "number");
      const maxAnzahl = Math.min(10, Math.max(1, Number(body.max_future_rates ?? 3)));
      const ids = (explizit.length > 0 ? explizit : ausVergleich).slice(0, maxAnzahl);

      if (ids.length === 0) {
        schritte.push({
          schritt: "future_rates",
          endpunkt: "GET /listings/future/rates",
          kosten_usd: 0,
          http_status: null,
          ok: false,
          befund:
            "Übersprungen: keine listing_ids. Entweder zuerst 'comparables' mitlaufen lassen oder IDs direkt mitgeben.",
        });
      } else {
        for (const id of ids) {
          const res = await fetch(
            `${BASE}/listings/future/rates?listing_id=${id}&currency=native`,
            { headers: { "x-api-key": apiKey } },
          );
          const text = await res.text();
          let daten: any = null;
          try { daten = JSON.parse(text); } catch { /* kein JSON */ }
          const raten: any[] = daten?.rates ?? [];
          const verfuegbar = raten.filter((r) => r?.available);

          schritte.push({
            schritt: "future_rates",
            endpunkt: `GET /listings/future/rates (${id})`,
            kosten_usd: KOSTEN.future_rates,
            http_status: res.status,
            ok: res.status === 200 && raten.length > 0,
            befund:
              res.status !== 200
                ? deuteStatus(res.status, text)
                : raten.length === 0
                ? "Keine künftigen Raten für dieses Objekt hinterlegt."
                : `${raten.length} Tage, davon ${verfuegbar.length} verfügbar.`,
            daten: {
              listing_id: id,
              waehrung: daten?.currency ?? null,
              tage_gesamt: raten.length,
              tage_verfuegbar: verfuegbar.length,
              erster_tag: raten[0]?.date ?? null,
              letzter_tag: raten[raten.length - 1]?.date ?? null,
              preis_statistik: statistik(raten.map((r) => r?.rate)),
              // Vollständige Tagesliste, damit die Oberfläche für einen
              // konkreten Lückenzeitraum filtern kann.
              raten,
            },
          });

          // Bei Key-/Guthabenfehler sofort abbrechen statt weiter zu zahlen.
          if (res.status === 401 || res.status === 402 || res.status === 403) break;
        }
      }
    }

    // --- radius_search (0,50 $) ------------------------------------------
    if (will("radius_search")) {
      const lat = Number(body.latitude);
      const lng = Number(body.longitude);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
        schritte.push({
          schritt: "radius_search",
          endpunkt: "POST /listings/search/radius",
          kosten_usd: 0,
          http_status: null,
          ok: false,
          befund: "Übersprungen: latitude und longitude sind für die Umkreissuche Pflicht.",
        });
      } else {
        const res = await fetch(`${BASE}/listings/search/radius`, {
          method: "POST",
          headers: { "x-api-key": apiKey, "Content-Type": "application/json" },
          body: JSON.stringify({
            latitude: lat,
            longitude: lng,
            radius_miles: Math.min(100, Math.max(1, Number(body.radius_miles ?? 15))),
            filter: { room_type: { eq: "entire_home" } },
            sort: { ttm_revenue: "desc" },
            pagination: { page_size: Math.min(25, Number(body.page_size ?? 25)), offset: 0 },
            currency: "native",
          }),
        });
        const text = await res.text();
        let daten: any = null;
        try { daten = JSON.parse(text); } catch { /* kein JSON */ }
        const treffer: any[] = daten?.results ?? [];
        // Für das spätere Übernehmen mitnehmen, falls comparables leer war.
        if (vergleichsobjekte.length === 0) vergleichsobjekte = treffer;

        schritte.push({
          schritt: "radius_search",
          endpunkt: "POST /listings/search/radius",
          kosten_usd: KOSTEN.radius_search,
          http_status: res.status,
          ok: res.status === 200,
          befund:
            res.status !== 200
              ? deuteStatus(res.status, text)
              : `${daten?.pagination?.total_count ?? 0} Objekte im Umkreis insgesamt, ${treffer.length} in dieser Seite.`,
          daten: {
            gesamt: daten?.pagination?.total_count ?? null,
            adr_pro_nacht: statistik(treffer.map((l) => l?.performance_metrics?.ttm_avg_rate)),
            reinigungsgebuehr: statistik(treffer.map((l) => l?.pricing_info?.cleaning_fee)),
            objekte: treffer.map(kompakt),
          },
        });
      }
    }

    const kosten = schritte.reduce((s, x) => s + x.kosten_usd, 0);
    const ausgefuehrt = schritte.filter((s) => s.http_status !== null);

    return antwort({
      ergebnis: ausgefuehrt.length === 0
        ? "NICHTS AUSGEFÜHRT"
        : ausgefuehrt.every((s) => s.ok)
        ? "ALLES OK"
        : "TEILWEISE",
      geprueft_fuer: { haus: hausName, address, bedrooms, baths, guests, markt: marktBegriff },
      kosten_usd: Math.round(kosten * 100) / 100,
      hinweis:
        "Diese Funktion schreibt nichts in die Datenbank. Guthaben: https://www.airroi.com/api/developer",
      schritte,
    });
  } catch (e) {
    return antwort(
      {
        ergebnis: "FEHLER",
        befund: (e as Error).message,
        kosten_usd: schritte.reduce((s, x) => s + x.kosten_usd, 0),
        schritte,
      },
      500,
    );
  }
});
