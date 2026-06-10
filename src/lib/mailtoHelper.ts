/**
 * mailto:-Helper — alle E-Mail-Kommunikation läuft über den lokalen
 * Mail-Client (Outlook). Es gibt KEINEN serverseitigen E-Mail-Versand mehr.
 *
 * WICHTIG zum Absender: Der mailto:-Standard erlaubt es nicht, den Absender
 * festzulegen. Outlook ignoriert nicht-standardisierte Parameter wie ?from=.
 * Der User muss im Outlook-Compose-Fenster ggf. manuell über das "Von"-Dropdown
 * auf steinbockchalets@gmail.com wechseln.
 */

/** Fester Absender für ALLE E-Mails aus der App. */
export const SENDER_EMAIL = 'steinbockchalets@gmail.com';

/**
 * Konvertiert HTML-Markup in lesbaren Plain-Text für mailto:-Body.
 * Strippt Tags, behält Zeilenumbrüche, Links werden als "Text (URL)" dargestellt.
 */
export function htmlToPlainText(html: string): string {
  if (!html) return '';

  let text = html;

  // <style> / <script> Blöcke komplett entfernen
  text = text.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');
  text = text.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '');

  // <br> → Newline
  text = text.replace(/<br\s*\/?>/gi, '\n');

  // Blockelemente → doppelter Newline
  text = text.replace(/<\/(p|div|h[1-6]|li|tr|section|article|header|footer)>/gi, '\n\n');
  text = text.replace(/<(p|div|h[1-6]|li|tr|section|article|header|footer)[^>]*>/gi, '');

  // Listen-Punkte
  text = text.replace(/<li[^>]*>/gi, '• ');

  // Links "Text (URL)"
  text = text.replace(/<a[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi, (_m, url, inner) => {
    const label = inner.replace(/<[^>]+>/g, '').trim();
    if (!label) return url;
    if (label === url) return url;
    return `${label} (${url})`;
  });

  // Alle restlichen Tags entfernen
  text = text.replace(/<[^>]+>/g, '');

  // HTML-Entities dekodieren
  text = text
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&euro;/gi, '€')
    .replace(/&auml;/gi, 'ä')
    .replace(/&ouml;/gi, 'ö')
    .replace(/&uuml;/gi, 'ü')
    .replace(/&Auml;/gi, 'Ä')
    .replace(/&Ouml;/gi, 'Ö')
    .replace(/&Uuml;/gi, 'Ü')
    .replace(/&szlig;/gi, 'ß')
    .replace(/&#(\d+);/g, (_m, dec) => String.fromCharCode(parseInt(dec, 10)));

  // Mehrfache Leerzeilen & Whitespace bereinigen
  text = text.replace(/[ \t]+\n/g, '\n');
  text = text.replace(/\n{3,}/g, '\n\n');
  text = text.replace(/^\s+|\s+$/g, '');

  return text;
}

export interface MailtoOptions {
  to: string | string[];
  subject?: string;
  /** Bevorzugt: bereits als Plain-Text. */
  text?: string;
  /** Wird per htmlToPlainText konvertiert, falls text nicht gesetzt ist. */
  html?: string;
  cc?: string | string[];
  bcc?: string | string[];
}

/**
 * Baut einen mailto:-Link für den lokalen Mail-Client.
 * Kann als href= verwendet werden.
 */
export function buildMailtoHref(opts: MailtoOptions): string {
  const toArr = Array.isArray(opts.to) ? opts.to : [opts.to];
  const toStr = toArr.filter(Boolean).join(',');

  const body = opts.text ?? htmlToPlainText(opts.html ?? '');

  const params: string[] = [];
  if (opts.subject) params.push(`subject=${encodeURIComponent(opts.subject)}`);
  if (body) params.push(`body=${encodeURIComponent(body)}`);
  if (opts.cc) {
    const cc = Array.isArray(opts.cc) ? opts.cc.join(',') : opts.cc;
    if (cc) params.push(`cc=${encodeURIComponent(cc)}`);
  }
  if (opts.bcc) {
    const bcc = Array.isArray(opts.bcc) ? opts.bcc.join(',') : opts.bcc;
    if (bcc) params.push(`bcc=${encodeURIComponent(bcc)}`);
  }

  return `mailto:${encodeURIComponent(toStr).replace(/%2C/g, ',')}${params.length ? `?${params.join('&')}` : ''}`;
}

/**
 * Alias für Abwärtskompatibilität — verwendet jetzt mailto:.
 * @deprecated Verwende buildMailtoHref.
 */
export const buildGmailComposeHref = buildMailtoHref;

/**
 * Öffnet den lokal installierten Mail-Client (Outlook) mit vorausgefüllter Nachricht.
 * Hinweis: Der User muss in Outlook ggf. das Absender-Konto manuell wechseln.
 */
export function openInMailClient(opts: MailtoOptions): boolean {
  const toArr = Array.isArray(opts.to) ? opts.to : [opts.to];
  const toStr = toArr.filter(Boolean).join(',');

  if (!toStr) {
    console.warn('[mailHelper] Keine Empfänger-Adresse angegeben.');
    return false;
  }

  const href = buildMailtoHref(opts);
  if (href.length > 1900) {
    console.warn(`[mailHelper] mailto-URL ist ${href.length} Zeichen lang — wird ggf. abgeschnitten.`);
  }
  window.location.href = href;
  return true;
}