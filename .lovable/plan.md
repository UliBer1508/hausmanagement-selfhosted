# Plan v2: REST-Endpoints für Oberpinzgau – aligned mit Teuni-Rechnungsmodell

## Erkenntnis aus dem Teuni-System

Teuni läuft **in derselben DB** wie die Logik-App (kein Sync nötig) und nutzt das Vollmodell `laundry_invoices` mit folgenden Feldern (Stand DB):

```
rechnungsnummer, rechnungsdatum, faelligkeitsdatum, bezahlt_am, status,
kunde_name, kunde_kundennummer, kunde_strasse, kunde_plz, kunde_ort,
nettobetrag, mwst_satz, mwst_betrag, bearbeitungsgebuehr, bruttobetrag,
positionen (jsonb), external_rechnung_id, external_bestellung_id,
external_kunde_id, external_updated_at, synced_at, notes
```

UI-Funktionen vorhanden: `LaundryInvoicesList`, `CreateInvoiceDialog`, `EditInvoiceDialog`, `MergeInvoicesDialog`, `AssignOrdersToInvoiceDialog`, `InvoiceDetailsDialog`.

→ **Konsequenz:** Die neuen Oberpinzgau-REST-Endpoints müssen **exakt dieses Schema spiegeln**, damit `sync-laundry-invoices` die Antwort 1:1 in `laundry_invoices` schreiben kann (wie heute beim Direkt-DB-Zugriff) und die bestehende Teuni-UI ohne Änderung weiterläuft.

---

## 1. Endpoint `external-order-status` (unverändert ggü. v1)

`GET /functions/v1/external-order-status` auf Portal-Projekt `pkpnowevagxmhyqlawng`.

- Auth: `Authorization: Bearer <PARTNER_TOKEN>` → Lookup in neuer Tabelle `partner_api_keys` (kundennummer, token_hash, is_active, last_used_at)
- Query: `bestellnummer` **oder** `bestellnummern` (CSV, max 100)
- Response je Bestellung: `bestellnummer, status, kunde_kundennummer, objekt_objektnummer, gastname, check_in, check_out, anzahl_personen, lieferdatum, abholdatum, erstellt_am, aktualisiert_am, gesamt_preis, waehrung, positionen[]`
- Status-Vokabular: `neu | in_bearbeitung | ausgeliefert | abgeholt | abgeschlossen | storniert`
- Tenant-Isolation strikt nach `kunde_kundennummer` aus dem Token
- Rate-Limit 60 req/min · 400/401/404/429

## 2. Endpoint `external-invoices` – **angepasst an Teuni-Schema**

`GET /functions/v1/external-invoices`

- Auth/Tenant-Isolation wie oben
- Query: `since` (ISO-Datum), `status` (`offen|bezahlt|storniert|mahnung`), `limit` (default 100, max 500), optional `rechnungsnummer` für Einzelabfrage
- **Response-Schema spiegelt `laundry_invoices` 1:1**:

```json
{
  "rechnungen": [
    {
      "id": "uuid",                    // → external_rechnung_id
      "rechnungsnummer": "R-2026-0042",
      "rechnungsdatum": "2026-04-30",
      "faelligkeitsdatum": "2026-05-30",
      "bezahlt_am": null,
      "status": "offen",
      "kunde_id": "uuid",              // → external_kunde_id
      "kunde_kundennummer": "K470214",
      "kunde_name": "Steinbock Chalets",
      "kunde_strasse": "...",
      "kunde_plz": "...",
      "kunde_ort": "...",
      "nettobetrag": 1200.00,
      "mwst_satz": 20,
      "mwst_betrag": 240.00,
      "bearbeitungsgebuehr": 0.00,
      "bruttobetrag": 1440.00,
      "waehrung": "EUR",
      "bestellung_id": "uuid",         // → external_bestellung_id (nullable bei Sammelrechnung)
      "updated_at": "2026-05-01T10:00:00Z",  // → external_updated_at
      "pdf_url": null,                 // signiert via createSignedUrl, später
      "positionen": [
        {
          "bezeichnung": "Bettwäsche",
          "menge": 12,
          "einzelpreis": 30.00,
          "summe": 360.00,
          "bestellnummer": "B0042",     // Verknüpfung zu Einzelbestellung
          "artikelnummer": "WA001"
        }
      ]
    }
  ],
  "count": 1
}
```

→ Die `positionen` werden als JSONB direkt in `laundry_invoices.positionen` übernommen (existing behavior in `sync-laundry-invoices`). Status-Mapping bleibt: nicht `offen|bezahlt|storniert|mahnung` ⇒ `offen`.

## 3. Auth-Tabelle `partner_api_keys` (im Portal-Projekt)

```
id uuid pk
kundennummer text not null
token_hash text not null unique     -- sha256(plaintext)
name text
is_active boolean default true
last_used_at timestamptz
created_at timestamptz default now()
```

RLS: nur Service Role. Klartext-Token wird einmalig generiert und an die Hausverwaltung übergeben. Logging optional in `partner_api_log`.

## 4. Anpassungen in der Logik-App (nach Live-Schalten)

| Datei | Änderung |
|-------|----------|
| `supabase/functions/sync-laundry-invoices/index.ts` | Statt `externalLaundryClient` direkt → `fetch(EXTERNAL_INVOICES_URL, {Authorization: Bearer …})`; Mapping bleibt identisch (Felder matchen bereits) |
| `src/hooks/useExternalOrderStatus.ts` | Statt direkter DB-Reads → Edge-Function-Proxy oder direkter `fetch` mit anon-tauglichem Bearer; Batch-Variante nutzt `bestellnummern=` |
| Neuer Secret im Logik-Projekt | `OBERPINZGAU_PARTNER_TOKEN` (Klartext für unsere eigene Kundennummer K470214) |
| `externalLaundryClient` | Nur noch für `ExternalArticleMappingDialog` (Artikel-Katalog), bis auch dafür ein REST-Endpoint existiert |

Teuni-Code bleibt **unangetastet** – läuft weiter als interne Direkt-DB.

## 5. Briefing für die Hausverwaltung

Nach Implementierung wird ein curl-Beispiel-Snippet ausgeliefert (analog v1-Briefing), aber mit dem oben präzisierten Rechnungs-Schema und Hinweis: „Felder = `laundry_invoices`-Schema der Logik-App, daher direkt 1:1 ingestbar."

---

## Offene Bestätigung

**Wo deployen?** Die zwei neuen Edge Functions gehören ins **Portal-Projekt `pkpnowevagxmhyqlawng`** (Wäsche Oberpinzgau), nicht in dieses Repo. Optionen:

1. Code hier erstellen → ich übergebe ihn dir, du deployst ihn manuell im Portal-Projekt
2. Du wechselst kurz ins Portal-Projekt und ich kann dort direkt deployen via cross-project (Standardweg in Lovable)

Sag mir Variante 1 oder 2, dann implementiere ich.
