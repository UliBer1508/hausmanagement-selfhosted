# Etappe 4 — Statusklärung und nächste Schritte

> Erstellt 13.08.2026 nach Rückfrage. Alle Angaben gegen den Repo-Stand `main`
> verifiziert, nicht aus Erinnerung.

---

## 1. Warum 317 statt 45 — die Zahlen messen Verschiedenes

Beide Zählungen sind richtig. Sie zählen nur nicht dasselbe.

| Metrik | Zahl | Was gezählt wird |
|---|---|---|
| **Abfragen** (gestern) | 45 offen | Supabase-`select`, die Gastdaten aus `bookings` holen |
| **Lesestellen** (mein Inventar) | 317 | jede Codezeile mit `booking.guest_name` o. ä. |

**Die Abfragen-Metrik ist die richtige.** Grund ist das Umstellungsmuster, das
gestern etabliert wurde: Direkt nach der Abfrage wird einmal gemappt —

```ts
guest_name: (b as any).guests?.name || b.guest_name
```

Damit trägt das Buchungsobjekt den korrekten Wert, und **alle nachgelagerten
Anzeigezeilen bleiben unverändert**. Eine Abfrage mit 15 Anzeigestellen braucht
also *zwei* Eingriffe, nicht sechzehn.

Meine 317 Lesestellen sind das, was passieren würde, wenn man jede Anzeigezeile
einzeln anfasst. Das wäre der falsche Weg — er würde die Arbeit versiebenfachen
und dabei mehr Fehler erzeugen als beheben. **Mein Inventar hat den Aufwand um
Faktor 7 überschätzt.**

Die Lesestellen-Zahl bleibt trotzdem nützlich, aber erst für Etappe 6: Sobald
die Spalten fallen, muss der Fallback `|| b.guest_name` aus den 45 Mappings
verschwinden — nicht aus 317 Anzeigezeilen.

### Reststand, mit derselben Methode wie gestern gezählt

| | Abfragen |
|---|---|
| Gesamt auf `bookings` mit Gastdaten | 58 |
| davon mit `guests`-Join (**erledigt**) | **32** |
| davon **offen** | **26** |

Aufgeschlüsselt nach den gestrigen Blöcken — die Zahlen decken sich exakt:

| Block | Inhalt | Abfragen | Status |
|---|---|---|---|
| 1 | Edge Functions ohne `chat-assistant` | 7 | ✅ live |
| 2 | Frontend | 14 | ✅ live (5 Reste, s. u.) |
| 3 | `chat-assistant`, explizite Feldlisten | 10 | ⚠️ **geliefert, nicht hochgeladen** |
| 4 | verschachtelte Abfragen | 3 | ⬜ offen |
| 5 | `select('*')` einzeln prüfen | 11 | ⬜ offen |
| — | Restarbeiten aus Block 2 | 5 | ⬜ offen |

---

## 2. Warum `chat-assistant` gestern der nächste Schritt war — und woran es scheiterte

**Es war der richtige Schritt und er wurde fertig.** Block 3 wurde gestern
vollständig umgesetzt: alle 10 Abfragen plus 13 Lesestellen, 95 Diff-Zeilen,
Syntaxprüfung bestanden, als `chat-assistant_ORDNER_index.ts` ausgeliefert.

**Gescheitert ist nicht die Umstellung, sondern der Upload.** Belegt:

| Prüfung | Befund |
|---|---|
| SHA `chat-assistant/index.ts` auf GitHub `main` heute | `8ee75503…` |
| SHA derselben Datei im gestrigen Backup (Zustand *vor* der Änderung) | `8ee75503…` |
| Vorkommen von `guests!bookings_guest_id_fkey` in der Live-Datei | **0** |
| Liegt `Etappe4-Bestandsaufnahme-Abfragen.md` in `docs/`? | **nein** |

Auf GitHub liegt byte-identisch der Stand *vor* Block 3. Die beiden letzten
Lieferungen von gestern — die umgebaute Edge Function **und** die
Bestandsaufnahme — haben das Repo nie erreicht.

**Das erklärt meinen Befund von heute Vormittag.** Ich habe korrekt gemeldet,
dass `chat-assistant` nicht umgestellt ist. Die Ursache war aber nicht
„vergessen", sondern ein unterbrochener Upload.

### Mein eigener Fehler dabei

Ich habe heute ein neues Inventar gebaut, ohne vorher in den früheren Chats nach
der bestehenden Bestandsaufnahme zu suchen. Im Repo war sie nicht — genau weil
sie nicht hochgeladen wurde —, aber ich hätte danach suchen können. Ergebnis:
dieselbe Arbeit zweimal, mit einer Metrik, die den Aufwand überzeichnet.

Das ist exakt das Muster, das im Konzept unter Abschnitt 0 beschrieben ist: Ein
Plan existiert, ist aber nicht auffindbar, also wird er neu erfunden. Beim
letzten Mal hat das die Übergangslogik zementiert; heute hat es eine Zahl
erzeugt, die den nächsten Schritt größer aussehen lässt, als er ist.

---

## 3. Warum `useBookings` und `useDashboard` gestern nicht dran waren

**Sie sind nicht vergessen worden — sie gehören in Block 5.**

Beide laden bereits vollständig:

```ts
.select('*, guests!bookings_guest_id_fkey(*)')
```

Die Query ist also *fertiger* als in Block 2, nicht unfertiger. Sie holen den
kompletten Gast mit. Was fehlt, ist ausschließlich die Konsumseite.

Meine heutige Einordnung „Join da, ungenutzt — halbfertig, vergessen" war in der
Beobachtung richtig, in der Bewertung falsch. Diese Abfragen wurden bewusst
zurückgestellt, weil `select('*')` eine andere Prüfung erfordert: Man muss bei
jedem Konsumenten einzeln nachsehen, welches Feld er liest — bei einer expliziten
Feldliste steht das in der Abfrage selbst.

Bei diesen beiden ist das besonders heikel, weil sie zentrale Hooks sind, deren
Rohobjekte per Spread an viele Komponenten weitergereicht werden.

---

## 4. Was als Nächstes zu tun ist — in dieser Reihenfolge

### Schritt 1 — Den offenen Upload abschließen (kein neuer Code)

Bevor irgendetwas Neues gebaut wird: Block 3 gehört ins Repo. Sonst arbeiten wir
gegen einen Stand, der nicht dem entspricht, was schon fertig ist.

1. `chat-assistant_ORDNER_index.ts` → umbenennen in `index.ts`,
   hochladen nach `supabase/functions/chat-assistant/`
2. `Etappe4-Bestandsaufnahme-Abfragen.md` → nach `docs/`
3. Deploy: `supabase functions deploy chat-assistant --project-ref usblrulkcgucxtkhugck`
4. **Verifikation vor dem Weitermachen:** SHA gegen GitHub prüfen (er darf
   *nicht* mehr `8ee75503…` sein), dann Max im Chat nach einem Gast fragen
   („Zeig mir alles zu Luca") — der Name muss erscheinen.

Falls die Datei nicht mehr vorliegt: Ich baue sie neu. Die Vorlage ist
reproduzierbar, das ist eine Stunde Arbeit, keine Neuentwicklung.

**Offene Frage an dich:** Weißt du noch, woran der Upload gestern hing? Wenn es
ein wiederkehrendes Problem ist (Dateigröße, Browser-Editor bei 4.000 Zeilen),
sollten wir den Weg ändern, sonst passiert dasselbe beim nächsten großen File.

### Schritt 2 — Restarbeiten aus Block 2 (5 Abfragen, klein)

| Datei : Zeile | Zu tun |
|---|---|
| `useGuests.ts:26` | `nationality` wird geladen, aber Z. 71 liest `guest.nationality` → **ersatzlos streichen** |
| `useGuests.ts:324` | Join vorhanden, aber ohne `nationality`; Z. 373 liest `booking.nationality` → Join erweitern, Lesestelle umstellen |
| `useMarketingActions.ts:189, 261` | Z. 166 filtert auf `booking.nationality` — **Logik-Stelle**, Join nötig |
| `useGuestStayCounts.ts:23` | nutzt bereits `getGuestKey` (guest_id zuerst) → funktional korrekt; die Felder `guest_email`/`guest_name` erst in Etappe 6 streichen |
| `useRebookingScore.ts:72` | Vorab-Abfrage der Zukunftsbuchungen; `guest_id` wird bereits genutzt → nur Feldliste bereinigen |

### Schritt 3 — Block 4: die drei verschachtelten Abfragen

Das ist der **einzige Punkt mit echtem Regressionsrisiko** im gesamten Umbau.
Betroffen sind die Filter in `chat-assistant` Z. 355 und 568
(`service_tasks → bookings` bzw. `linen_orders → bookings`, jeweils mit
`.ilike('bookings.guest_name', …)` und `!inner`).

Diese beiden wurden am 14.07.2026 mühsam von JS-Nachfilterung auf DB-Filterung
umgebaut, weil vorher alles ab Treffer 21 für Max unsichtbar war („Es gibt keine
Reinigung für Luca" — obwohl sie existierte).

**Vor dem Umbau ist isoliert zu prüfen**, ob PostgREST einen Filter über zwei
Relationsebenen (`bookings.guests.name`) zuverlässig anwendet. Das ist eine
einzelne Testabfrage im Supabase-Dashboard, keine Codeänderung. Fällt der Test
negativ aus, bleibt der Filter vorerst auf der Kopie stehen — das ist zulässig,
weil die Spalten bis Etappe 6 gefüllt bleiben.

### Schritt 4 — Block 5: die elf `select('*')`-Abfragen

Pro Abfrage prüfen, welches Feld der Konsument tatsächlich liest. Bei
`useBookings.ts` und `useDashboard.ts` zusätzlich die weitergereichten
Komponenten (`CalendarTab`, `BookingOverviewFixed` …) — das ist die im
CODE-INDEX unter „Technische Fallen 1" beschriebene Falle.

### Danach: Etappe 5 vor Etappe 6

Nicht Teil von Etappe 4, aber zwingend vor dem Löschen:
`import-guest-list` und `chat-assistant` (`executeAcceptBookingInquiry`) setzen
**keine** `guest_id` — heute im Code bestätigt. Sie funktionieren nur, weil der
Link-Trigger sie nachholt, und der bezieht seine Eingabe aus genau den
Kopiespalten, die gelöscht werden sollen.

---

## 5. Empfehlung

Schritt 1 ist die einzige Aufgabe, die jetzt ansteht. Alles Weitere baut darauf
auf, und solange der Stand im Repo nicht dem entspricht, was schon fertig ist,
produziert jede weitere Analyse falsche Zahlen — meine von heute Vormittag
eingeschlossen.
