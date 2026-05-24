## Probleme

1. **Erfundene Kontaktdaten**: Die KI erfindet Telefonnummer und Kontakt-E-Mail aus dem Nichts. Im System sind nur Absender-E-Mail (`steinbockchalets@gmail.com`) und Firmenname hinterlegt – sonst nichts.
2. **Erfundene Angebote**: Die KI erfindet eigenständig „11 % Rabatt + Willkommensgeschenk", obwohl niemand das so definiert hat.

Beides muss verschwinden: die KI darf **nichts erfinden** und soll vor dem Schreiben **fragen**, was angeboten wird.

---

## Lösungskonzept

### A) Neuer Schritt im Dialog: „Was bieten wir an?"

Vor dem Klick auf „Personalisiertes Angebot generieren" wird ein kompaktes Eingabe-Formular angezeigt mit:

- **Rabatt** (optional, in %) – Zahl oder leer
- **Gutschein/Extra** (optional, freier Text, z. B. „Welcome-Drink", „Spa-Gutschein 50 €", leer = nichts)
- **Gültigkeit** (optional, freier Text, z. B. „buchbar bis 31.07.2026")
- **Zusätzlicher Hinweis** (optional, freier Text für individuelle Botschaft)

Defaults: alle leer → KI bietet **gar nichts** an, nur eine freundliche Wiedersehens-Nachricht.

### B) Kontaktdaten zentral pflegen – nicht erfinden

Da heute keine Telefon-/Kontakt-Felder existieren, erweitern wir `system_settings` um einen Eintrag `contact_settings`:

```json
{
  "contact_email": "steinbockchalets@gmail.com",
  "contact_phone": "+43 ...",
  "signature_name": "Uli Berresheim",
  "signature_role": "Steinbock Chalets"
}
```

- Migration legt den Eintrag mit leeren Defaults an (du füllst danach aus).
- Neue kleine UI in **Einstellungen → Profil/Kontakt**, in der du Telefon, Kontakt-E-Mail und Signatur pflegst.
- Edge Function lädt `contact_settings` aus der DB und übergibt sie der KI als **Fakten**. Telefon/E-Mail werden zusätzlich als feste Signatur unten an den von der KI generierten Text angehängt – nicht im LLM-freien Fließtext, damit nichts erfunden werden kann.

### C) Edge Function `generate-personalized-email` härten

Neuer Body-Parameter:
```json
{
  "offer": {
    "discount_percent": null,
    "voucher": "",
    "validity": "",
    "extra_note": ""
  }
}
```

System-Prompt-Regeln (strikt):
- „Verwende **ausschließlich** die unten genannten Angebotsdetails. **Erfinde keine Rabatte, Gutscheine, Preise, Telefonnummern oder E-Mail-Adressen.**"
- „Wenn kein Rabatt/Gutschein angegeben ist, **erwähne keinen**. Schreibe stattdessen eine freundliche, persönliche Wiedersehens-Nachricht ohne konkretes Angebot."
- „Schließe den Text **ohne Signatur**. Die Signatur wird automatisch angehängt."
- Bei leerem Angebot: kürzerer, persönlicher Ton ohne Werbung.

Die Signatur (Name, Rolle, Tel, E-Mail) wird **in der Edge Function deterministisch** aus `contact_settings` zusammengebaut und an `content` angehängt. So ist garantiert, dass die richtigen, echten Kontaktdaten in jeder Mail stehen.

### D) Frontend-Anpassung `RebookingCampaign.tsx`

- Neuer „Angebot konfigurieren"-Block im Dialog (4 Felder) wird **vor** dem Generate-Button angezeigt.
- Werte werden an die Edge Function durchgereicht.
- Toast-Hinweis: „KI verwendet nur die hier angegebenen Angebotsdetails."

---

## Umfang der Änderungen

- **DB-Migration**: `system_settings`-Eintrag `contact_settings` mit Default-Schema anlegen.
- **`supabase/functions/generate-personalized-email/index.ts`**: `offer` & `contact_settings` lesen, strikter System-Prompt, deterministische Signatur am Ende.
- **`src/components/Guests/RebookingCampaign.tsx`**: Angebots-Formular im Dialog, Übergabe an Edge Function.
- **`src/components/Settings/...`** (kleinste passende Datei): Felder für Telefon, Kontakt-E-Mail, Signatur pflegen.

Bestehende Tabs, Score-Logik und der Versand bleiben unverändert.