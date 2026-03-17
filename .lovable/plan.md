
Ziel: Die Löschfunktion für Rechnungen klar sichtbar und zuverlässig nutzbar machen.

Befund:
- Die technische Löschlogik ist bereits vorhanden (`useDeleteLaundryInvoice`).
- Auch ein Delete-Button existiert in `LaundryInvoicesList.tsx`, ist aber in der Praxis leicht „versteckt“ (enge Aktionsspalte, viele Buttons in einer Zeile, horizontales Scrollen im Tabellenbereich).
- Deshalb wirkt es für Nutzer so, als ob die Funktion fehlt.

Umsetzungsplan:

1) Aktionen in der Rechnungsliste robust sichtbar machen
- Datei: `src/components/ServicePortal/LaundryInvoicesList.tsx`
- Aktionsspalte umbauen, damit „Löschen“ nicht mehr abgeschnitten ist:
  - Entweder: kompakte Aktionsdarstellung mit `DropdownMenu` (Einträge: Details/Bearbeiten/Zusammenführen/Als bezahlt/Löschen)
  - Oder: feste Spaltenbreite + `flex-wrap`, sodass Buttons umbrechen statt abgeschnitten zu werden.
- „Löschen“ als klaren destruktiven Eintrag mit Text labeln (nicht nur Icon), damit es sofort auffindbar ist.
- Pending-State berücksichtigen (`deleteMutation.isPending`), um Doppelklicks zu verhindern.

2) Zweiten, klaren Lösch-Einstieg im Bearbeiten-Dialog ergänzen
- Datei: `src/components/ServicePortal/EditInvoiceDialog.tsx`
- Zusätzlich einen roten „Rechnung löschen“-Button im Dialog-Footer einbauen (mit `AlertDialog`-Bestätigung).
- Vorteil: Auch wenn Tabellenaktion übersehen wird, ist Löschen direkt beim Bearbeiten erreichbar.

3) Bestehende Mutation weiterverwenden (kein neuer Backend-Code)
- Datei: `src/hooks/useLaundryInvoices.ts`
- Vorhandenen Hook `useDeleteLaundryInvoice` weiterverwenden:
  - zuerst Verknüpfung in `linen_orders` lösen,
  - dann Rechnung löschen,
  - danach Query-Invalidierung + Toast.
- Nur kleine UX-Ergänzung falls nötig (z. B. konsistente Fehlermeldung).

Technische Details:
- Primäre Ursache ist UI/Usability, nicht fehlende Lösch-Implementierung.
- Es sind keine neuen Supabase-Migrationen nötig.
- Betroffene Komponenten:
  - `LaundryInvoicesList.tsx` (Sichtbarkeit/Bedienbarkeit)
  - `EditInvoiceDialog.tsx` (zusätzlicher Zugriffspfad)
  - optional kleiner Feinschliff in `useLaundryInvoices.ts`

Abnahme nach Umsetzung:
1. In „Rechnungen“ ist pro Zeile eine klar erkennbare Löschoption sichtbar.
2. Klick auf Löschen öffnet Bestätigungsdialog.
3. Nach Bestätigung wird Rechnung gelöscht, verknüpfte Bestellungen bleiben erhalten (nur entkoppelt), Liste aktualisiert sich.
4. Flow funktioniert für Entwurf und normale Rechnung bei aktueller Viewport-Breite (ca. 967px) ohne versteckte Aktion.
