# Dokumentenverwaltung mit OneDrive

> **Stand:** 20.08.2026 · Repo `hausmanagement-selfhosted`
> **Status:** im Betrieb. Erste echte Rechnung abgelegt und in OneDrive
> geprüft (`RG-0001-20260118.pdf` in `DokumentManagement/Teuni/Rechnungen`).
>
> Dieses Dokument beschreibt, was gebaut wurde, warum es so gebaut wurde und
> woran die Einrichtung dreimal gescheitert ist. Abschnitt 8 ist der
> wichtigste — dieselben Fallen kommen bei jeder Microsoft-Anbindung wieder.
>
> **Nicht verwechseln mit** `docs/Konzept-OneDrive-Belegarchiv.md`. Das
> beschreibt die Gegenrichtung (OneDrive → App, Scannen per Handy, Auslesen
> per Gemini) und ist **nicht umgesetzt**. Seine Abschnitte zu OAuth und
> Token-Verwaltung gelten weiter und wurden übernommen.

---

## 1. Kurzfassung

- **Ein Dokument = Datei + Metadaten + EIN Bezug.** Inhalte werden nicht
  ausgelesen und nicht in Positionen zerlegt.
- **Die Datei bleibt in OneDrive.** Die Datenbank hält nur Metadaten und die
  `onedrive_item_id`. Keine Zweitablage in Supabase Storage.
- **Dokumenttyp und Zuordnung sind unabhängig** frei wählbar. Der Typ
  erzwingt nichts.
- **Der Ablageort wird festgelegt, nicht abgeleitet.** Uli wählt den Ordner;
  die Wahl wird je Kombination aus Objekt und Dokumenttyp gemerkt.
- Struktur in OneDrive: **`DokumentManagement / <Objekt> / <Dokumenttyp>`**
- **Der Zugriffstoken verlässt die Edge Function nie.** Der Browser bekommt
  nur eine kurzlebige Upload-Adresse von Microsoft.

---

## 2. Warum es so gebaut ist

### Warum die Datei in OneDrive bleibt

Zwei Ablagen wären zwei Wahrheiten. Uli arbeitet ohnehin in OneDrive, teilt
Belege mit dem Steuerberater und scannt mit dem Handy hinein. Eine Kopie in
Supabase Storage müsste ständig abgeglichen werden und wäre bei jedem
Auseinanderlaufen eine Fehlerquelle.

### Warum `onedrive_item_id` und nicht der Pfad

Die ID überlebt Umbenennen und Verschieben in OneDrive. Der Pfad tut das
nicht. `onedrive_path` wird trotzdem gespeichert — aber ausdrücklich nur zur
Anzeige, und er darf veralten.

### Warum der Typ die Zuordnung nicht erzwingt

Ursprünglich hatte `document_types` ein Feld `link_target`: „Reinigungs-
rechnung" konnte nur an einer Reinigung hängen. Der Betrieb widerlegte das
sofort. Boris' Rechnung 002048/2026 führt fünf Reinigungen in zwei Häusern
über zwei Monate — an welchen einzelnen `service_task` sollte sie hängen?
Dieselbe Art Rechnung gehört einmal an einen einzelnen Auftrag
(Fensterputzen an einem Tag) und einmal an den Dienstleister.

`link_target` ist deshalb veraltet und wird nicht mehr ausgewertet.

### Warum ein eigener Objekttyp „Vendor"

Rechnungen kommen von Absendern, die keine `service_providers` sind:
Gemeinde Neukirchen (Kurtaxe), Salzburg AG, Handwerker, Anwalt. Sie in
`service_providers` anzulegen würde die Tabelle verbiegen — dort stehen
Amela, Boris und Teuni mit Portalzugang, Abrechnungsart und Aufträgen, und
sie tauchen in Auswahllisten auf, in die ein Stromversorger nicht gehört.

Erwogen und verworfen wurde ein freies Textfeld `vendor` am Dokument. Es
hätte Schreibvarianten erzeugt („Gemeinde Neukirchen" gegen „Gem.
Neukirchen") und damit unzuverlässige Filter. Stattdessen eine schlanke
Tabelle `document_vendors`.

### Warum der Ablageort festgelegt und nicht abgeleitet wird

Erster Entwurf: eine Regel je Typ mit Platzhaltern, etwa `{haus}/Reinigung`.
Das scheiterte an zwei Stellen. Bei einer Provider-Sammelrechnung über zwei
Häuser ist `{haus}` nicht auflösbar. Und die Häuser heißen „Venediger
Chalet", die Ordner aber „Venediger" — jede Ableitungsregel hätte beim
dritten Haus gebrochen.

Uli legt den Ordner deshalb selbst fest. Beim ersten Ablegen einer neuen
Kombination wählt er im Baum (und legt notfalls an); danach steht der Ordner
automatisch da.

### Warum feste Fremdschlüssel bei `documents`, aber `entity_type` bei `document_locations`

Bei `documents` verweist jede Zeile auf **höchstens ein** Objekt, und die
Integrität ist bei Rechnungen etwas wert: `ON DELETE SET NULL` verhindert
tote Verweise. Also je eine nullable Spalte pro Bezugstyp.

Bei `document_locations` wird **absichtlich heterogen** verwiesen — mal auf
ein Haus, mal auf einen Dienstleister, mal auf einen Vendor. Sechs Spalten,
von denen immer fünf leer sind, wären schlechter. Und der Verweis ist
unkritisch: Geht ein Objekt verloren, ist der Eintrag nur eine ungenutzte
Vorbelegung, kein Datenverlust.

---

## 3. Datenmodell

SQL: `supabase/SQL/51_dokumentenverwaltung.sql` und
`supabase/SQL/52_dokumente_ablageorte.sql`

### integration_tokens

| Spalte | Bedeutung |
|---|---|
| `provider` | PK, hier `'onedrive'` |
| `refresh_token` | wird bei **jedem** Refresh von Microsoft rotiert |
| `access_token`, `access_expires_at` | Zwischenspeicher, 60–90 Min gültig |
| `account_label` | verbundenes Konto, nur zur Anzeige |
| `last_error` | letzter Fehlercode; füllt den gelben Balken in der Oberfläche |

> **RLS aktiv, aber KEINE Policy.** Das ist Absicht, kein vergessener
> Schritt: nur `service_role` — also Edge Functions — kommt heran. Ein Token
> im Browser würde die Absicherung aufheben.

### document_types

| Spalte | Bedeutung |
|---|---|
| `name` | Anzeigename, z. B. „Rechnung" |
| `folder_name` | Unterordner in OneDrive, z. B. „Rechnungen" |
| `color`, `is_active`, `sort_order` | Darstellung und Auswahl |
| ~~`link_target`~~, ~~`folder_rule`~~ | **veraltet**, nicht mehr auswerten |

`folder_name` ist bewusst getrennt vom Namen: Der Typ darf „Vertrag" heißen
und der Ordner „Verträge". Ein CHECK verbietet Pfadtrenner
(`/ \ : * ? " < > |`).

Typen werden **deaktiviert, nicht gelöscht** — ein gelöschter Typ ließe
bestehende Dokumente ohne Bezeichnung zurück.

### document_vendors

`name` (unique, ohne Rücksicht auf Groß- und Kleinschreibung), `note`,
`is_active`. Rechnungsabsender ohne eigenes Systemobjekt.

### documents

| Spalte | Bedeutung |
|---|---|
| `file_name`, `mime_type`, `size_bytes` | aus Graph nach dem Upload |
| `document_type_id` | → `document_types` |
| `house_id`, `booking_id`, `service_task_id`, `linen_order_id`, `provider_id`, `vendor_id` | je nullable, **höchstens einer gesetzt** |
| `onedrive_item_id` | UNIQUE — zugleich der Duplikatschutz |
| `onedrive_drive_id`, `onedrive_web_url`, `onedrive_path` | Verweis und Anzeige |

### document_locations — der festgelegte Ablageort

| Spalte | Bedeutung |
|---|---|
| `entity_type` | `haus` \| `provider` \| `vendor` \| `buchung` \| `reinigung` \| `waesche` |
| `entity_id` | Kennung des Objekts |
| `document_type_id` | → `document_types` |
| `onedrive_item_id`, `onedrive_path` | der gewählte Ordner |

UNIQUE über `(entity_type, entity_id, document_type_id)` — genau dieser
Schlüssel wird beim `upsert` als `onConflict` verwendet.

Beispiel:

```
Boris + Rechnung  ->  DokumentManagement/Boris/Rechnungen
Boris + Vertrag   ->  DokumentManagement/Boris/Verträge
Teuni + Rechnung  ->  DokumentManagement/Teuni/Rechnungen
```

**Bei Buchung, Reinigung und Wäschelieferung** hängt der Ablageort am
zugehörigen **Haus** — eine Reinigung vom 09.08. bekommt keinen eigenen
Ordner. Die Verknüpfung zum Auftrag steht trotzdem in `documents` und macht
das Dokument dort wiederfindbar. Umgesetzt in `useEntities` über die Felder
`locationType` und `locationId` der `EntityOption`.

---

## 4. Dateien

| Datei | Aufgabe |
|---|---|
| `supabase/functions/_shared/onedrive.ts` | Token holen und erneuern, Graph-Aufrufe, Ordnerpfad sicherstellen |
| `supabase/functions/onedrive-oauth/index.ts` | einmalige Anmeldung bei Microsoft |
| `supabase/functions/onedrive-api/index.ts` | alle Dateioperationen |
| `src/hooks/useDocuments.ts` | sämtliche Zugriffe für die Oberfläche |
| `src/components/Documents/DocumentsTab.tsx` | Übersicht, Suche, Ablage-Dialog |
| `src/components/Documents/DocumentSettings.tsx` | Typen, Objekte, Ablageorte |
| `src/pages/OriginalDashboard.tsx` | Tab „Dokumente" eingehängt (Lazy-Import, `tabs`-Liste, `renderTabContent`) |
| `supabase/config.toml` | `verify_jwt = false` für beide Functions |

### Aktionen von `onedrive-api`

| Aktion | Zweck |
|---|---|
| `status` | ist OneDrive verbunden? Antwortet auch **ohne** Token |
| `listFolders` | Unterordner eines Ordners |
| `listChildren` | Ordner **und** Dateien |
| `createFolder` | Ordner anlegen (`conflictBehavior: rename`) |
| `resolvePath` | Pfad anlegen/finden — Rest aus dem Regel-Entwurf, kaum noch genutzt |
| `uploadSession` | Upload-Adresse anfordern |
| `itemInfo` | Metadaten nach dem Upload |
| `deleteItem` | in den OneDrive-Papierkorb |

> **`itemInfo` liefert bei einem Ordner den Pfad des ELTERNordners**, nicht
> den eigenen (`parentReference.path`). Deshalb baut die Oberfläche den Pfad
> aus dem Klickweg im Baum auf, nicht aus dieser Antwort.

---

## 5. Der Upload-Weg

```
1. Browser  -> Edge Function: uploadSession {folderId, fileName}
2. Function -> Graph: createUploadSession        (Token bleibt serverseitig)
3. Function -> Browser: uploadUrl                (kurzlebig, vorautorisiert)
4. Browser  -> Microsoft: PUT in Blöcken à 1,6 MB
5. Browser  -> Edge Function: itemInfo {itemId}
6. Browser  -> Supabase: insert in documents
7. Browser  -> Supabase: upsert in document_locations   (Ablageort merken)
```

**Warum die Bytes nicht durch die Edge Function laufen:** Der einfache
Graph-Upload endet bei 4 MB — Handyfotos von Rechnungen liegen oft darüber.
Über eine Upload-Session lädt der Browser direkt zu Microsoft, und das
Zugriffstoken verlässt die Function trotzdem nie. Die Blockgröße muss ein
Vielfaches von 320 KiB sein; verwendet werden 1,6 MB.

**Bekannte Lücke:** Bricht Schritt 6 ab, liegt die Datei in OneDrive ohne
Datenbankeintrag. Sie erscheint dann in der Ordneransicht als „nicht
verknüpft". Ein Aufräumlauf existiert nicht.

---

## 6. Oberfläche

### Tab „Dokumente"

**Suche** mit Filterspalten links (Haus, Typ, Jahr) samt Zählern. Die Zähler
zeigen, was die jeweils **anderen** Filter übrig lassen; Kategorien ohne
Treffer werden ausgegraut. Ergebnisse nach Monat gruppiert, Nachladen in
Blöcken von 25.

**Ordner** spiegelt die echte OneDrive-Struktur. Nicht verknüpfte Dateien
erscheinen grau als „nicht verknüpft".

Gesucht wird in der **Datenbank**, nicht in OneDrive: Dateiname, Pfad, Typ
und Objektname. Nicht im Dateiinhalt.

### Ablage-Dialog — vier Abschnitte

1. **Was ist es** — Dokumenttyp
2. **Wozu gehört es** — Zuordnungsart und Objekt, unabhängig vom Typ
3. **Datei wählen** — Mein PC (Ziehen oder Durchsuchen) oder OneDrive
4. **Datei ablegen in** — Ordnerbaum, vorbelegt aus dem Ablageort

Bei Quelle „OneDrive" entfällt Abschnitt 4 inhaltlich: Die Datei bleibt, wo
sie liegt, und wird nur verknüpft.

> **Bedienregel im Baum:** Ein Klick auf die **Zeile** öffnet den Ordner,
> gewählt wird über den Knopf **„Diesen Ordner nehmen"** darunter. Eine
> frühere Fassung hatte pro Zeile zwei fast gleiche Schaltflächen (Haken und
> Pfeil) — wer nur den Haken sah, kam nie tiefer als eine Ebene. Das war ein
> echter Bedienfehler im Entwurf, kein Missverständnis des Nutzers.

Das Plus in der Pfadleiste legt einen Ordner an, geht hinein **und wählt ihn
aus**.

Der Papierkorb an einem Dokument entfernt **nur die Verknüpfung**; die Datei
bleibt in OneDrive. Die Edge Function *kann* löschen (`deleteItem`), die
Oberfläche ruft es nicht auf — eine versehentlich gelöschte Rechnung wäre
schlimmer als eine verwaiste Datei.

### Einstellungen — drei Reiter

**Dokumenttypen** — Name, Ordnername, Farbe, aktiv/inaktiv.

**Objekte** — drei Gruppen: Dienstleister, Häuser, Vendoren. Die ersten
beiden nur zur Ansicht („aus dem System"); ihre Namen werden unter
„Provider" und „Häuser" gepflegt. Zwei Pflegestellen für dieselben
Stammdaten wären eine sichere Quelle für Widersprüche. Nur Vendoren sind
hier anlegbar, änderbar und löschbar.

**Ablageorte** — eine Zeile je Kombination, mit Pfad. Änderbar und
entfernbar. Die Liste wächst mit dem, was tatsächlich benutzt wird.

---

## 7. Einrichtung von Grund auf

Falls das je wiederholt werden muss:

**1. App bei Microsoft registrieren.** `entra.microsoft.com` → Entra ID →
App-Registrierungen → Neue Registrierung.
Kontotypen: **nur persönliche Microsoft-Konten**.
Umleitungs-URI, Plattform **Web**, zeichengenau:
`https://usblrulkcgucxtkhugck.supabase.co/functions/v1/onedrive-oauth`

> Microsoft hat 2026 die Registrierung **außerhalb eines Verzeichnisses**
> eingestellt. Ein persönliches Konto allein genügt nicht mehr; es braucht
> einen Tenant. Ein Verzeichnis über „Mandanten verwalten" anzulegen
> scheitert seinerseits ohne Azure-Konto (Meldung: Konto im Mandanten
> „Microsoft Services" nicht vorhanden). Praktikabel war nur die kostenlose
> Azure-Anmeldung — sie verlangt eine Kreditkarte zur Identitätsprüfung,
> belastet sie aber nicht. App-Registrierungen kosten nichts.
>
> Das Verzeichnis ist nur der Behälter. Der Kontotyp „nur persönliche
> Konten" sorgt dafür, dass die Anmeldung weiter über `/consumers` läuft und
> auf das private OneDrive zugreift.

**2. Geheimnis und Berechtigungen.** Zertifikate & Geheimnisse → neuer
Clientschlüssel, 24 Monate. Der **Wert** ist nur beim Anlegen sichtbar; die
Geheimnis-ID daneben ist nutzlos.
API-Berechtigungen → Microsoft Graph → **Delegierte** Berechtigungen:
`Files.ReadWrite`, `User.Read`, `offline_access`.

> `Files.ReadWrite` — nicht `.All` (reicht weiter als nötig), nicht
> `.Selected` (nur einzelne freigegebene Dateien), nicht `.AppFolder`
> (käme nicht an die bestehenden Ordner heran).
>
> `offline_access` ist der unscheinbarste und wichtigste Eintrag: ohne ihn
> liefert Microsoft **keinen Refresh-Token**, und die Verbindung stirbt nach
> einer Stunde.
>
> **Anwendungsberechtigungen funktionieren bei persönlichen Konten nicht.**
> Daher der ganze OAuth-Aufwand statt eines einfachen Dienstkontos.

**3. Secrets setzen.**

```
supabase secrets set MS_CLIENT_ID=<Anwendungs-ID> MS_CLIENT_SECRET='<Wert>' --project-ref usblrulkcgucxtkhugck
```

> Einfache Anführungszeichen sind in PowerShell **zwingend** — Microsoft-
> Geheimnisse enthalten `~`, das sonst als Benutzerverzeichnis gedeutet und
> verstümmelt weitergereicht wird.

**4. SQL ausführen** (`51_…`, dann `52_…`) im Supabase-Editor.

**5. Functions deployen.**

```
git pull
supabase functions deploy onedrive-oauth --project-ref usblrulkcgucxtkhugck
supabase functions deploy onedrive-api   --project-ref usblrulkcgucxtkhugck
```

**6. Einmal anmelden.** `…/functions/v1/onedrive-oauth` im Browser öffnen.
Danach **in der Datenbank prüfen**, nicht der Seite glauben:

```sql
select provider, account_label, last_error, access_expires_at
from integration_tokens;
```

Eine Zeile, `last_error` leer. Erst dann funktioniert irgendetwas anderes.

**Kalendereintrag auf Juli 2028.** Das Geheimnis läuft am 19.08.2028 ab.
Danach steht die gesamte Anbindung still, ohne dass die Ursache erkennbar
wäre.

---

## 8. Drei Fallen, die zugeschlagen haben

### `redirect_uri` niemals aus `req.url` ableiten

Die erste Fassung baute sie zur Laufzeit:

```ts
const redirectUri = `${url.origin}${url.pathname}`;   // FALSCH
```

Supabase reicht die Anfrage intern weiter. Daraus wurde

```
http://usblrulkcgucxtkhugck.supabase.co/onedrive-oauth          (54 Zeichen)
```

statt

```
https://usblrulkcgucxtkhugck.supabase.co/functions/v1/onedrive-oauth   (68)
```

— falsches Schema **und** fehlendes `/functions/v1`. Microsoft antwortete
mit `invalid_request` und nannte die erwartete Zeichenkette nicht. Beide
Seiten sahen für sich betrachtet richtig aus; die Suche lief eine Stunde in
die falsche Richtung, unter anderem über Kontotyp und Zeichenvergleich der
registrierten Adresse.

**Richtig:**

```ts
const projectUrl = (Deno.env.get("SUPABASE_URL") ?? "").replace(/\/+$/, "");
const redirectUri = `${projectUrl}/functions/v1/onedrive-oauth`;
```

**Lehre:** Bei einem Wert, der zeichengenau stimmen muss, gehört er ins Log.
Gefunden wurde es erst über einen vorübergehenden `?debug=1`-Zweig, der die
zusammengebaute Adresse ausgab. Der Zweig wurde danach wieder entfernt.

### `supabase.rpc()` ist ein Thenable, kein Promise

```ts
await supabase.rpc("lock_onedrive_refresh").catch(() => {});   // FALSCH
```

`.catch()` existiert dort nicht. Die Zeile sollte einen Fehlschlag abfangen
und warf stattdessen selbst „catch is not a function".

Das Tückische: Sie sitzt im **Refresh-Pfad**, der nur läuft, wenn das
Zugriffstoken abgelaufen ist. Nach der Anmeldung lief alles rund eine
Stunde — dann brach jeder OneDrive-Aufruf ab.

**Richtig:**

```ts
try {
  const { error } = await supabase.rpc("lock_onedrive_refresh");
  if (error) console.warn("Advisory Lock nicht gesetzt:", error.message);
} catch (e) { /* ohne Sperre weiter */ }
```

**Lehre:** Fehler in selten begangenen Pfaden zeigen sich verspätet. Der
Abstand zwischen Ursache und Wirkung führte zunächst zu ganz falschen
Vermutungen.

### Wert gegen Geheimnis-ID

Beim Clientschlüssel wurde einmal die Geheimnis-ID statt des Werts kopiert.
Microsoft sagt das erfreulich deutlich (`AADSTS7000215`), aber es kostete
zwei Anläufe.

**Nützlich dabei:** Supabase bildet den Secret-DIGEST als **reines
SHA-256**. Damit lässt sich prüfen, ob ein gesetztes Geheimnis dem
erwarteten Wert entspricht:

```
supabase secrets list --project-ref usblrulkcgucxtkhugck
```

Verifiziert daran, dass `SUPABASE_PUBLISHABLE_KEYS` den Digest von `{}`
trägt (`44136fa3…`).

---

## 9. Wenn etwas klemmt

| Zeichen | Ursache |
|---|---|
| `AADSTS50011` / `invalid_request` bei redirect_uri | Umleitungs-URI weicht ab, oder sie wird falsch gebaut |
| `AADSTS7000215` / `invalid_client` | Geheimnis falsch — Wert statt ID prüfen, Anführungszeichen in PowerShell |
| `invalid_grant` | Zustimmung entzogen oder Passwort geändert → neu anmelden |
| Gelber Balken im Tab | `integration_tokens` leer oder `last_error` gesetzt |
| „catch is not a function" | veraltete `_shared/onedrive.ts` deployt |
| Upload bricht ab | Logs von `onedrive-api`; die Aktion steht im Log-Präfix |

Nach dem Beheben eines Geheimnis-Fehlers ist **keine Neuanmeldung nötig** —
der Refresh-Token bleibt gültig:

```sql
update integration_tokens set last_error = null where provider = 'onedrive';
```

`_shared/onedrive.ts` wird von beiden Functions eingebunden. Nach einer
Änderung dort **beide** neu deployen.

---

## 10. Offene Punkte

- **Der Ordner-Auswähler startet im Stammordner**, auch wenn ein Ablageort
  festgelegt ist. Dorthin zu springen bräuchte eine Elternketten-Abfrage
  über Graph.
- **Verwaiste Dateien.** Bricht der Datenbankeintrag nach dem Upload ab,
  liegt die Datei ohne Verknüpfung in OneDrive. Sichtbar in der
  Ordneransicht, aber kein Aufräumlauf.
- **Kein Abgleich mit bestehenden OneDrive-Ordnern.** Was direkt
  hineinkopiert wird, kennt die Datenbank nicht.
- **Keine Volltextsuche im Dateiinhalt.** Rechnungsnummern und Beträge sind
  nicht durchsuchbar — das wäre der Gemini-Teil aus
  `docs/Konzept-OneDrive-Belegarchiv.md`, bewusst zurückgestellt.
- **`types.ts` neu generieren.** Bis dahin tragen die Schreibpfade auf den
  neuen Tabellen ein `as any` mit Kommentar.
- **Zwei falsch benannte Secrets** in Supabase: `steinbockchalets.com` und
  `uli.berresheim@hotmail.de` — letzteres mit demselben Digest wie
  `PORTAL_PASSWORD`. Aufräumen wäre sauber.
- **`resolvePath`** ist ein Rest aus dem Regel-Entwurf und wird im
  Normalbetrieb nicht mehr aufgerufen.

---

## 11. Prüfabfragen

```sql
-- Verbindung
select provider, account_label, last_error, access_expires_at, updated_at
from integration_tokens;

-- Typen mit ihrem Ordnernamen
select name, folder_name, color, is_active
from document_types order by sort_order;

-- Festgelegte Ablageorte
select entity_type, entity_id, document_type_id, onedrive_path
from document_locations;

-- Dokumente mit ihrem Bezug
select d.file_name, t.name as typ, d.onedrive_path, d.created_at,
       h.name as haus, sp.name as dienstleister, v.name as vendor
from documents d
left join document_types    t  on t.id  = d.document_type_id
left join houses            h  on h.id  = d.house_id
left join service_providers sp on sp.id = d.provider_id
left join document_vendors  v  on v.id  = d.vendor_id
order by d.created_at desc;

-- Dokumente ohne jeden Bezug
select file_name, created_at from documents
where house_id is null and booking_id is null and service_task_id is null
  and linen_order_id is null and provider_id is null and vendor_id is null;
```
