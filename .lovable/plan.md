## Schritte

1. **Cleanup ungenutzter Edge Functions**
   - Ordner `supabase/functions/sync-linen-order-external/` löschen
   - Ordner `supabase/functions/test-external-laundry-connection/` löschen
   - Beide Functions via `supabase--delete_edge_functions` aus Supabase entfernen

2. **Test-Bestellung senden**
   - Sicherstellen, dass `linen_automation_settings.external_sync_enabled = true` (sonst kurz aktivieren)
   - `sync_transport = 'rest'` ist bereits Default
   - Edge Function `sync-linen-order-rest` aufrufen mit:
     - `linen_order_id = 35c035ef-804a-487e-9d4f-1a67699e6495`
     - Bestellung: Christiaan Van Der Horst, Wald Chalet (O550634), 02.–09.08.2026, 4 Personen
   - Antwort prüfen: HTTP-Status, `bestellnummer`, ggf. Fehlermeldung
   - Falls Fehler: Edge-Function-Logs + `linen_sync_log`-Eintrag auswerten und Diagnose berichten
   - Falls Erfolg: `external_bestellnummer` und `external_synced_at` in DB verifizieren

3. **Ergebnis-Bericht**
   - Welche Functions wurden gelöscht
   - Status der Test-Bestellung (erfolgreich / Fehlerursache)
   - Ggf. Empfehlung (z. B. Artikelnummern-Mismatch, Bearer-Token ungültig, fehlende Felder)

## Hinweis

Der REST-Endpoint hat keinen Sandbox-Modus — die Bestellung wird **real** im Oberpinzgau-Portal angelegt. Das ist bewusst so gewünscht (User-Auswahl).