# Lovable-Auftrag: Gmail-Web zuverlässig öffnen (ERR_BLOCKED_BY_RESPONSE beheben)

## Hintergrund
In der Lovable-Vorschau (iframe) blockt Gmail das Öffnen via
`window.open(url, '_blank', 'noopener,noreferrer')` mit
`ERR_BLOCKED_BY_RESPONSE`. Lösung: Gmail über einen echten Anker-Klick
(target="_blank") auf oberster Ebene öffnen.

> Hinweis: In der VERÖFFENTLICHTEN App (eigene Domain, kein iframe) tritt der
> Block i. d. R. nicht auf. Diese Änderung macht es zusätzlich in der Vorschau
> robuster.

## Datei `src/lib/mailtoHelper.ts`

Ersetze die Funktion `openEmail(...)` durch die folgende Fassung und füge die
neue Hilfsfunktion `openUrlTopLevel` direkt davor ein:

```ts
/**
 * Öffnet eine URL zuverlässig in einem neuen Top-Level-Tab.
 * Nutzt einen echten Anker-Klick mit target="_blank" und rel="noopener".
 * Das umgeht iframe-/Vorschau-Einschränkungen (z. B. ERR_BLOCKED_BY_RESPONSE),
 * die bei window.open(...) mit Feature-Parametern auftreten können.
 */
function openUrlTopLevel(url: string): void {
  const a = document.createElement('a');
  a.href = url;
  a.target = '_blank';
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

export function openEmail(opts: MailtoOptions & { preferLocalClient?: boolean }): boolean {
  const toStr = joinAddrs(opts.to);
  if (!toStr) {
    console.warn('[mailHelper] Keine Empfänger-Adresse angegeben.');
    return false;
  }
  if (opts.preferLocalClient) {
    window.location.href = buildMailtoHref(opts);
  } else {
    openUrlTopLevel(buildGmailComposeHref(opts));
  }
  return true;
}
```

## Optional: gleiche Methode für die zwei direkten window.open-Stellen

Für volle Konsistenz können auch diese beiden Stellen den Anker-Klick nutzen
(funktional aber meist schon ok):
- `src/components/Dashboard/GuestContactAlertBanner.tsx` (~79)
- `src/components/Guests/GuestEmailDialog.tsx` (~205)

## Abnahme
- In der veröffentlichten App öffnet „Test-Entwurf öffnen" einen Gmail-Tab mit
  Absender steinbockchalets@gmail.com, Betreff + Text vorausgefüllt.
- Kein ERR_BLOCKED_BY_RESPONSE mehr.
