/**
 * mailto:-Helper — alle E-Mail-Kommunikation läuft über den lokalen Mail-Client.
 * Es gibt KEINEN serverseitigen E-Mail-Versand mehr.
 */

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
 * Öffnet den lokal installierten E-Mail-Client mit vorausgefüllter Nachricht.
 * Der User editiert dort den Text und sendet manuell von steinbockchalets@gmail.com.
 *
 * Gibt true zurück, wenn der mailto-Link initiiert wurde (was nicht garantiert,
 * dass der User wirklich einen Mail-Client installiert hat).
 */
export function openInMailClient(opts: MailtoOptions): boolean {
  const toArr = Array.isArray(opts.to) ? opts.to : [opts.to];
  const toStr = toArr.filter(Boolean).join(',');

  if (!toStr) {
    console.warn('[mailtoHelper] Keine Empfänger-Adresse angegeben.');
    return false;
  }

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

  const href = `mailto:${encodeURIComponent(toStr).replace(/%2C/g, ',')}${params.length ? `?${params.join('&')}` : ''}`;

  // Browser-Limit für mailto: ist je nach OS/Client ca. 2000 Zeichen.
  if (href.length > 1900) {
    console.warn(`[mailtoHelper] mailto-URL ist ${href.length} Zeichen lang — wird ggf. abgeschnitten.`);
  }

  // window.location.href öffnet zuverlässig den Standard-Mail-Client
  window.location.href = href;
  return true;
}