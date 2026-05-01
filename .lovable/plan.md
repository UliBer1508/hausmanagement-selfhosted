

# Israel zur Nationalitäten-Liste hinzufügen

## Problem
Die Länder-Auswahl im Buchungsformular ist eine hartkodierte Liste in `src/components/Bookings/CreateBookingForm.tsx` (Zeile 88-131) mit ca. 42 Ländern. Israel ist nicht enthalten — ebenso fehlen viele andere häufige Herkunftsländer von Gästen.

## Lösung

In `src/components/Bookings/CreateBookingForm.tsx` die `countries`-Liste erweitern um:

- **IL** — Israel
- **AE** — Vereinigte Arabische Emirate
- **SA** — Saudi-Arabien
- **EG** — Ägypten
- **MA** — Marokko
- **TN** — Tunesien
- **TH** — Thailand
- **SG** — Singapur
- **KR** — Südkorea
- **HK** — Hongkong
- **TW** — Taiwan
- **ID** — Indonesien
- **PH** — Philippinen
- **VN** — Vietnam
- **NZ** — Neuseeland
- **CL** — Chile
- **CO** — Kolumbien
- **PE** — Peru
- **IS** — Island
- **EE** — Estland
- **LV** — Lettland
- **LT** — Litauen
- **RS** — Serbien
- **BA** — Bosnien-Herzegowina
- **MK** — Nordmazedonien
- **AL** — Albanien
- **ME** — Montenegro
- **XK** — Kosovo
- **MD** — Moldau
- **BY** — Belarus
- **GE** — Georgien
- **AM** — Armenien
- **AZ** — Aserbaidschan

Die Liste wird alphabetisch nach Ländername (Deutsch) sortiert, damit Israel und alle anderen Länder leicht auffindbar sind.

## Hinweis
Das `nationality`-Feld erlaubt 2-Buchstaben-Codes (ISO 3166-1 alpha-2), `IL` ist der korrekte Code für Israel und passt zur bestehenden Validierung (Zeile 67).

