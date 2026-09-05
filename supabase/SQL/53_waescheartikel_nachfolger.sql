-- 53_waescheartikel_nachfolger.sql
--
-- Zweck: Die Auswahlliste im Tab "Wäschesets" soll nur Artikel anbieten, die
-- dort fachlich hingehoeren. Heute bietet sie alle elf an, darunter die
-- Kleingewerbezeile und die Lohnwaesche — und drei Nummern fuer dasselbe
-- Waeschepaket, ohne Hinweis, welche die aktuelle ist.
--
-- Zwei Spalten loesen das, beide als DATEN und nicht als Regel im Code:
--
--   nachfolger_id  Teuni vergibt fuer dieselbe Leistung ueber die Zeit neue
--                  Nummern (MWR -> MW3 -> MW4). Ohne diese Kette zeigen alte
--                  Set-Zeilen auf eine Nummer, an der kein Preis mehr
--                  nachwaechst — der Preisstand friert still ein.
--
--   set_faehig     Nicht jeder Artikel gehoert auf eine Set-Zeile. KLGEW ist
--                  eine Rechnungszeile, WT/WTB ist Lohnwaesche nach kg. Ihre
--                  Preise werden weiter gefuehrt und geprueft — sie sind nur
--                  nicht auswaehlbar. Deshalb NICHT status='ignorieren':
--                  das hiesse "beim Rechnungslesen uebergehen", und das waere
--                  falsch.
--
-- WICHTIG: Der SQL-Editor fuehrt nur den MARKIERTEN Text aus. Jeden Block
-- einzeln absetzen. ALTER und UPDATE liefern keine Zeilen zurueck — die
-- Wirkung steht erst im SELECT dahinter.


-- ---------------------------------------------------------------- Block 1
alter table public.laundry_articles
  add column if not exists nachfolger_id uuid references public.laundry_articles(id);

-- Pruefung Block 1
select column_name, data_type
from information_schema.columns
where table_name = 'laundry_articles' and column_name = 'nachfolger_id';


-- ---------------------------------------------------------------- Block 2
alter table public.laundry_articles
  add column if not exists set_faehig boolean not null default true;

-- Pruefung Block 2
select column_name, data_type, column_default
from information_schema.columns
where table_name = 'laundry_articles' and column_name = 'set_faehig';


-- ---------------------------------------------------------------- Block 3
-- ANSEHEN, NICHT AENDERN. Die Reihenfolge der Kette in Block 5 wird aus
-- diesen Daten abgeleitet, nicht geraten. Der Artikel mit dem juengsten
-- zuletzt_gesehen ist der aktuelle; er bekommt KEINEN Nachfolger.
select artikelnummer, bezeichnung, einheit,
       erstmals_gesehen, zuletzt_gesehen, status
from public.laundry_articles
order by artikelnummer;


-- ---------------------------------------------------------------- Block 4
-- Nicht auf Set-Zeilen auswaehlbar.
update public.laundry_articles
set set_faehig = false, updated_at = now()
where artikelnummer in ('KLGEW', 'WT2', 'WT3', 'WTB2', 'WTB3');

-- Pruefung Block 4 — erwartet: 5 Zeilen false, 6 Zeilen true
select artikelnummer, bezeichnung, set_faehig
from public.laundry_articles
order by set_faehig desc, artikelnummer;


-- ---------------------------------------------------------------- Block 5
-- Nachfolgekette fuer das Waeschepaket.
--
-- ANNAHME, die Block 3 bestaetigen muss: MWR ist die aelteste, MW4 die
-- aktuelle Nummer. Weichen die Daten davon ab, die beiden Anweisungen
-- entsprechend umstellen, BEVOR sie laufen.
--
-- Bei Teuni ist die Gleichsetzung MWR = MW3 = MW4 noch nicht schriftlich
-- bestaetigt (angefragt am 05.09.2026). Die Kette ist jederzeit mit
-- "set nachfolger_id = null" zurueckzunehmen, ohne Datenverlust: die
-- Artikel und ihre Preise bleiben unangetastet.
--
-- WT2/WT3 und WTB2/WTB3 bekommen BEWUSST keine Kette. Ihre Bezeichnungen
-- unterscheiden sich darin, ob gewaschen wird ("Waesche trocknen" gegen
-- "Waschen Trocknen") — das koennen zwei Leistungen sein und nicht zwei
-- Generationen. Ohne Teunis Auskunft wird hier nichts gleichgesetzt.

update public.laundry_articles a
set nachfolger_id = n.id, updated_at = now()
from public.laundry_articles n
where a.artikelnummer = 'MWR'
  and n.artikelnummer = 'MW3'
  and n.provider_id = a.provider_id;

update public.laundry_articles a
set nachfolger_id = n.id, updated_at = now()
from public.laundry_articles n
where a.artikelnummer = 'MW3'
  and n.artikelnummer = 'MW4'
  and n.provider_id = a.provider_id;

-- Pruefung Block 5 — erwartet: MWR -> MW3, MW3 -> MW4, MW4 -> leer
select a.artikelnummer, a.bezeichnung, n.artikelnummer as nachfolger
from public.laundry_articles a
left join public.laundry_articles n on n.id = a.nachfolger_id
order by a.artikelnummer;


-- ---------------------------------------------------------------- Block 6
-- Gegenprobe: Was bietet die Auswahlliste kuenftig an?
-- Erwartet werden genau die Artikel, die auf einer Set-Zeile stehen duerfen:
-- MW4, MWBVL, MWHT, MWST.
select artikelnummer, bezeichnung, einheit
from public.laundry_articles
where set_faehig
  and status <> 'ignorieren'
  and nachfolger_id is null
order by artikelnummer;


-- ---------------------------------------------------------------- Block 7
-- Zyklusprobe. Muss LEER bleiben. Ein Zyklus (A -> B -> A) wuerde die
-- spaetere Preisaufloesung endlos laufen lassen; die Sicht bricht zwar nach
-- 10 Schritten ab, aber der Preis waere dann willkuerlich.
with recursive kette as (
  select id as start_id, nachfolger_id, 1 as tiefe
  from public.laundry_articles
  where nachfolger_id is not null
  union all
  select k.start_id, a.nachfolger_id, k.tiefe + 1
  from kette k
  join public.laundry_articles a on a.id = k.nachfolger_id
  where a.nachfolger_id is not null and k.tiefe < 10
)
select start_id, tiefe
from kette
where nachfolger_id = start_id or tiefe >= 10;
