/**
 * E-Mail-Helper — öffnet E-Mails standardmäßig in Gmail-Web mit dem festen
 * Absender steinbockchalets@gmail.com (authuser). Dadurch ist der Absender
 * korrekt gesetzt und Betreff/Text bleiben erhalten — kein manueller
 * Kontowechsel im lokalen Client mehr nötig.
 *
 * Die mailto:-Variante (lokaler Client, z. B. Outlook) bleibt als bewusste
 * Option erhalten (openInMailClient / buildMailtoHref).
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

  text = text.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');
  text = text.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '');
  text = text.replace(/<br\s*\/?>/gi, '\n');
  text = text.replace(/<\/(p|div|h[1-6]|li|tr|section|article|header|footer)>/gi, '\n\n');
  text = text.replace(/<(p|div|h[1-6]|li|tr|section|article|header|footer)[^>]*>/gi, '');
  text = text.replace(/<li[^>]*>/gi, '• ');
  text = text.replace(/<a[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi, (_m, url, inner) => {
    const label = inner.replace(/<[^>]+>/g, '').trim();
    if (!label) return url;
    if (label === url) return url;
    return `${label} (${url})`;
  });
  text = text.replace(/<[^>]+>/g, '');
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

function joinAddrs(v?: string | string[]): string {
  if (!v) return '';
  return (Array.isArray(v) ? v : [v]).filter(Boolean).join(',');
}

/**
 * Baut einen Gmail-Web-Compose-Link mit festem Absender (authuser).
 */
export function buildGmailComposeHref(opts: MailtoOptions): string {
  const body = opts.text ?? htmlToPlainText(opts.html ?? '');
  const params = new URLSearchParams();
  params.set('authuser', SENDER_EMAIL);
  params.set('view', 'cm');
  params.set('fs', '1');
  const to = joinAddrs(opts.to);
  if (to) params.set('to', to);
  if (opts.subject) params.set('su', opts.subject);
  if (body) params.set('body', body);
  const cc = joinAddrs(opts.cc);
  if (cc) params.set('cc', cc);
  const bcc = joinAddrs(opts.bcc);
  if (bcc) params.set('bcc', bcc);
  return `https://mail.google.com/mail/?${params.toString()}`;
}

/**
 * Baut einen mailto:-Link für den lokalen Mail-Client (z. B. Outlook).
 */
export function buildMailtoHref(opts: MailtoOptions): string {
  const toStr = joinAddrs(opts.to);
  const body = opts.text ?? htmlToPlainText(opts.html ?? '');
  const params: string[] = [];
  if (opts.subject) params.push(`subject=${encodeURIComponent(opts.subject)}`);
  if (body) params.push(`body=${encodeURIComponent(body)}`);
  const cc = joinAddrs(opts.cc);
  if (cc) params.push(`cc=${encodeURIComponent(cc)}`);
  const bcc = joinAddrs(opts.bcc);
  if (bcc) params.push(`bcc=${encodeURIComponent(bcc)}`);
  return `mailto:${encodeURIComponent(toStr).replace(/%2C/g, ',')}${params.length ? `?${params.join('&')}` : ''}`;
}

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

/**
 * Öffnet die E-Mail standardmäßig in Gmail-Web (fester Absender).
 * Der Mailtext wird NICHT in die URL gepackt (Gmail-URL-Längenlimit) —
 * stattdessen wird er in die Zwischenablage geschrieben; der Nutzer fügt
 * ihn im Gmail-Fenster mit Strg+V ein.
 * Mit preferLocalClient=true wird stattdessen der lokale Client (mailto:) genutzt.
 */
export async function openEmail(
  opts: MailtoOptions & { preferLocalClient?: boolean },
): Promise<{ opened: boolean; copied: boolean }> {
  const toStr = joinAddrs(opts.to);
  if (!toStr) {
    console.warn('[mailHelper] Keine Empfänger-Adresse angegeben.');
    return { opened: false, copied: false };
  }
  if (opts.preferLocalClient) {
    window.location.href = buildMailtoHref(opts);
    return { opened: true, copied: false };
  }
  const body = opts.text ?? htmlToPlainText(opts.html ?? '');
  let copied = false;
  if (body) {
    try {
      await navigator.clipboard.writeText(body);
      copied = true;
    } catch (e) {
      console.warn('[mailHelper] Zwischenablage nicht verfügbar:', e);
    }
  }
  const gmailHref = buildGmailComposeHref({ ...opts, text: '', html: '' });
  openUrlTopLevel(gmailHref);
  return { opened: true, copied };
}

/**
 * Öffnet den lokal installierten Mail-Client (Outlook) mit mailto:.
 */
export function openInMailClient(opts: MailtoOptions): boolean {
  const toStr = joinAddrs(opts.to);
  if (!toStr) {
    console.warn('[mailHelper] Keine Empfänger-Adresse angegeben.');
    return false;
  }
  window.location.href = buildMailtoHref(opts);
  return true;
}