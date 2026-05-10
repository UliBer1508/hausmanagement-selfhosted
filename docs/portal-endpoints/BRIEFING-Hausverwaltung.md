# Integrations-Briefing für Hausverwaltungen

Wir stellen zwei REST-Endpoints bereit, mit denen ihr **Bestellstatus** und **Rechnungen**
automatisiert in eure Hausverwaltung übernehmen könnt. Auth identisch zum bestehenden
`external-order-import`: `Authorization: Bearer <PARTNER_TOKEN>`.

Wir vergeben pro Hausverwaltung einen eigenen Partner-Token, der intern auf eure
Kundennummer gemappt ist. Ihr seht ausschliesslich Daten zu eurer Kundennummer
(Tenant-Isolation, kein Cross-Access). Token rotierbar ohne Code-Deploy.

Base-URL: `https://pkpnowevagxmhyqlawng.supabase.co/functions/v1/`

---

## 1) Bestellstatus abfragen

```bash
# Einzelabfrage
curl -H "Authorization: Bearer $PARTNER_TOKEN" \
  "https://pkpnowevagxmhyqlawng.supabase.co/functions/v1/external-order-status?bestellnummer=B0042"

# Batch (max. 100)
curl -H "Authorization: Bearer $PARTNER_TOKEN" \
  "https://pkpnowevagxmhyqlawng.supabase.co/functions/v1/external-order-status?bestellnummern=B0042,B0043,B0044"
```

**Response (Einzel):**

```json
{
  "bestellnummer": "B0042",
  "status": "in_bearbeitung",
  "kunde_kundennummer": "K470214",
  "objekt_objektnummer": "OBJ-001",
  "gastname": "Familie Mustermann",
  "check_in": "2026-05-10",
  "check_out": "2026-05-15",
  "anzahl_personen": 4,
  "lieferdatum": "2026-05-09",
  "abholdatum": "2026-05-16",
  "erstellt_am": "2026-05-09T12:34:56Z",
  "aktualisiert_am": "2026-05-10T08:15:00Z",
  "gesamt_preis": 461.00,
  "waehrung": "EUR",
  "positionen": [
    { "artikelnummer": "WA001", "name": "Bettwäsche", "menge": 4, "einzelpreis": 30.00, "summe": 120.00 }
  ]
}
```

Batch-Response: `{ "orders": [ ... ] }` (nur gefundene).

- Status-Werte: `neu`, `in_bearbeitung`, `ausgeliefert`, `abgeholt`, `abgeschlossen`, `storniert`
- Fehler: `400` ohne Parameter · `401` Token ungültig · `404` (nur Einzel) · `429` Rate-Limit
- Empfehlung: Polling alle 5–15 min für offene Bestellungen

---

## 2) Rechnungen abrufen

```bash
curl -H "Authorization: Bearer $PARTNER_TOKEN" \
  "https://pkpnowevagxmhyqlawng.supabase.co/functions/v1/external-invoices?since=2026-01-01&status=offen&limit=100"
```

Optionale Query-Parameter: `since` (ISO-Datum), `status` (`offen|bezahlt|storniert|mahnung`),
`limit` (default 100, max 500), `rechnungsnummer` für Einzelabfrage.

**Response — Schema = `laundry_invoices` (Logik-App), 1:1 ingestbar:**

```json
{
  "rechnungen": [
    {
      "id": "uuid",
      "rechnungsnummer": "R-2026-0042",
      "rechnungsdatum": "2026-04-30",
      "faelligkeitsdatum": "2026-05-30",
      "bezahlt_am": null,
      "status": "offen",
      "kunde_id": "uuid",
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
      "bestellung_id": "uuid",
      "updated_at": "2026-05-01T10:00:00Z",
      "pdf_url": null,
      "positionen": [
        {
          "bezeichnung": "Bettwäsche",
          "menge": 12,
          "einzelpreis": 30.00,
          "summe": 360.00,
          "bestellnummer": "B0042",
          "artikelnummer": "WA001"
        }
      ]
    }
  ],
  "count": 1
}
```

Ihr könnt die Antwort direkt in eure `laundry_invoices`-Tabelle schreiben — Feldnamen
stimmen 1:1 überein. Verknüpfung zu Einzelbestellungen über `positionen[].bestellnummer`.

`pdf_url` ist aktuell `null` — signierte PDF-URL liefern wir in der nächsten Iteration.

---

## Was wir von euch brauchen

1. **PDF-Bedarf**: Genügt euch das JSON oder ist das PDF zwingend (dann priorisieren wir die signierte URL)?
2. **Polling-Intervall**: 15 min für Status, 1×/Tag für Rechnungen ok?
3. **Bestätigung Schema**: Reichen die obigen Felder für eure Buchhaltung?

Bei OK generieren wir den Token und übergeben ihn euch sicher (1Password / verschlüsselte Mail).
