# Nebenkosten: touristisch vs. Festvermietung

> **Stand:** 01.11.2026 · SQL: `supabase/SQL/67_betriebskosten_je_haus.sql`
> **Anlass:** Im Haus-Dialog zeigte der Tab „Nebenkosten" auch bei fest
> vermieteten Häusern Kurtaxe, Reinigung und Wäsche pro Aufenthalt — Werte, die
> nur für Gästebuchungen gelten und dort zudem nur Standardwerte waren.

---

## 1. Zwei Modelle, die nur denselben Namen tragen

| | Touristische Vermietung | Festvermietung |
|---|---|---|
| Was | Gebühren je Gästeaufenthalt | Betriebskosten je Kalenderjahr |
| Beispiele | Kurtaxe, Endreinigung, Wäsche, Strompauschale, MwSt | Wasser, Kanal, Heizung, Müll, Grundsteuer, Versicherung, Internet |
| Berechnung | pauschal oder pro Person (Kurtaxe pro Person und Nacht) | Jahresbetrag × Verteilerschlüssel (Fläche, Personen, Einheiten) |
| Gegenrechnung | — (wird auf den Buchungspreis aufgeschlagen) | Vorauszahlungen des Mieters → Nachzahlung oder Guthaben |
| Daten | `houses.additional_fees` (JSON) | `utility_settings`, `utility_costs`, `utility_cost_categories`, `utility_statements` |
| Oberfläche | `Houses/AdditionalFeesTab.tsx` | `Tenants/UtilityCostsPanel.tsx` |
| Hook | `usePricingConfig` | `useUtilityCosts` |
| Nutzer im Code | Preisberechnung, Gästeanalyse, Konkurrenzanalyse, Edge Function `analyze-vacancy` | Mieter-Tab, Abrechnungs-PDF (`lib/utilityStatementPdf.ts`) |

Die beiden Modelle haben **keine** gemeinsamen Daten. Ein Haus nutzt immer genau
eines — entschieden durch `houses.rental_type`.

---

## 2. Wo man was sieht

**Haus-Dialog → Tab „Nebenkosten"** (`Houses/EditHouseDialog.tsx`)
- `rental_type = 'tourist'` (oder leer) → `AdditionalFeesTab`
- `rental_type = 'long_term'` → `UtilityCostsPanel` mit fester `houseId`
- Vermietungsart im Dialog geändert, aber noch nicht gespeichert → Hinweis
  „erst speichern". Maßgeblich ist die gespeicherte Art, weil die
  Betriebskosten-Komponenten das Haus über `useHouses({ rental_type: 'long_term' })`
  finden (Mieterdaten für die Abrechnung).

**Mieter → Nebenkosten** (`Tenants/TenantManagement.tsx`)
- dieselbe `UtilityCostsPanel`, ohne `houseId` → mit Objektauswahl.

Es gibt bewusst nur **eine** Betriebskosten-Ansicht für beide Einstiege. Die drei
Unterkomponenten (`UtilityCostSettings`, `UtilityCostEntry`,
`UtilityStatementGenerator`) haben dafür ein optionales `houseId`.

---

## 3. Betriebskosten: Land und Kostenarten je Haus (SQL 67)

**Land** — `utility_settings.country` (`'DE'` Standard, `'AT'`)
- Die mitgelieferten Kostenarten folgen der deutschen BetrKV (§ 2).
- Für Österreich gilt bei Vollanwendung das MRG; ein Einfamilienhaus fällt in
  der Regel nicht darunter — dann bestimmt der Mietvertrag, was umgelegt wird.
  Das System gibt deshalb nur Vorschläge, die Auswahl trifft Uli je Haus.
- `utility_cost_categories.country`: `DE`, `AT` oder leer (= beide).
  - nur DE: Schornsteinreinigung, Entwässerung, Straßenreinigung
  - nur AT (neu): Rauchfangkehrer, Kanalgebühren, Verwaltungshonorar
  - beide (neu): Internet, Strom Mietobjekt

**Auswahl je Haus** — `utility_settings.excluded_category_ids`
- Bisher wurden die Häkchen unter „Kostenarten" **nicht gespeichert** (nur im
  Browser-Zustand; nach Neuladen wieder alle an).
- Jetzt wird die **Abwahl** gespeichert. Absicht: Eine neu angelegte Kostenart
  erscheint automatisch bei jedem Haus, statt versteckt zu bleiben.
- Bereits erfasste Kosten eines Jahres werden immer angezeigt, auch wenn ihre
  Kostenart später abgewählt wird.

**Eine Regel, eine Stelle:** Welche Kostenarten ein Haus angeboten bekommt,
entscheidet `getCategoriesForHouse()` in `hooks/useUtilityCosts.ts`.

**Haus in Österreich umstellen:** Haus-Dialog → Nebenkosten → Einstellungen →
„Land des Objekts" = Österreich → Speichern.

---

## 4. Touristische Gebühren: Standardwerte erkennbar

`normalizeFeesV2()` füllt fehlende Posten mit festen Standardwerten
(Service 0 · Kurtaxe 2,50 p. P./Nacht · Reinigung 80 · Strom 40 · Wäsche 30 ·
MwSt 19 %). Bis 01.11.2026 sah man nicht, ob ein Wert gespeichert oder nur
Standard ist. Jetzt:
- `getStoredFeeKeys()` (`hooks/usePricingConfig.ts`) liefert die tatsächlich
  gespeicherten Posten.
- `AdditionalFeesTab` markiert alle anderen mit „Standardwert" und zeigt einen
  Hinweis, wenn für das Haus noch gar nichts gespeichert ist.
- Beim MwSt-Feld steht ein Hinweis: 19 % ist der deutsche Regelsatz, für
  Beherbergung in Österreich gilt ein ermäßigter Satz. Der Standardwert selbst
  wurde **nicht** geändert, weil er in die Preisberechnung aller Häuser ohne
  gespeicherten Wert eingeht — das entscheidet Uli bewusst pro Haus.

---

## 5. Nebenbei behobene Fehler

| Datei | Fehler | Behebung |
|---|---|---|
| `UtilityCostSettings.tsx` | Kostenarten-Häkchen wurden nie gespeichert | `excluded_category_ids` + Knopf „Auswahl speichern" |
| `UtilityCostEntry.tsx` | Dialog „Neue Kostenart" bot den Schlüssel `70_30` an; `calculateTenantShare` kennt nur `verbrauch_70_30` → Mieteranteil fiel still auf 100 % | Auswahl kommt jetzt aus `distributionKeyLabels` (eine Quelle) |
| alle drei Utility-Komponenten | feste Breiten (`w-32`) ohne Umbruch | `flex-col sm:flex-row`, `w-full sm:w-32` (Mobile-First) |

---

## 6. Offene Punkte (nicht in diesem Schritt erledigt)

1. **Vorauszahlung steht an drei Stellen:** `utility_settings.monthly_prepayment`,
   `houses.tenant_info.additional_costs` (Tab „Mietvertrag") und
   `tenant_rent_changes.new_additional_costs` (Mietänderungen). Die Abrechnung
   nimmt `monthly_prepayment × 12`, sonst `additional_costs × 12` — eine
   Änderung der Vorauszahlung im Laufe des Jahres wird **nicht** berücksichtigt.
   Richtig wäre die Summe über die Monate mit `getActiveAdditionalCosts()`
   (`hooks/useTenantRentChanges.ts`), die auch die Soll-Miete nutzt.
2. **Verteilerschlüssel vereinfacht:** `verbrauch_70_30` rechnet nur nach Fläche;
   `personen` ergibt bei einem Mieterhaushalt immer 100 %.
3. **Max kennt die Betriebskosten nicht.** `chat-assistant` filtert fast überall
   auf `rental_type = 'tourist'` und liest weder `utility_*` noch
   `additional_fees`. Für das KI-System wäre ein Lese-Werkzeug sinnvoll
   (z. B. „Stand Betriebskosten Haus X Jahr Y, fehlende Kostenarten,
   voraussichtliche Nachzahlung"). Vorher Punkt 1 klären, sonst rechnet Max mit
   der falschen Vorauszahlung.
4. `hooks/useAdditionalFees.ts` wird nirgends importiert (toter Code, eigene
   Standardwerte) — kann gelöscht werden.
5. `src/integrations/supabase/types.ts` kennt die neuen Spalten erst nach dem
   nächsten Generieren der Typen. Der Code kommt ohne aus (optionale Felder).

---

## 7. Prüfen nach dem Einspielen

1. SQL 67 im SQL-Editor ausgeführt; Prüf-Abfragen am Dateiende liefern die neuen
   Spalten und Kostenarten.
2. Festvermietetes Haus öffnen → Tab „Nebenkosten" zeigt „Betriebskosten
   (Festvermietung)" mit Einstellungen / Kosten erfassen / Abrechnung, ohne
   Objektauswahl.
3. Land umstellen, eine Kostenart abwählen, speichern, Seite neu laden → Auswahl
   bleibt.
4. Touristisches Haus öffnen → Tab „Nebenkosten" wie bisher; nicht gespeicherte
   Posten tragen „Standardwert".
5. Mieter → Nebenkosten funktioniert unverändert mit Objektauswahl.
