// Prüfung, ob eine Anfrage wirklich von Alexa kommt (alexa-max, 24.11.2026).
//
// Amazon signiert jede Anfrage an einen selbst gehosteten Skill:
//   Header SignatureCertChainUrl  Adresse der Zertifikatskette (nur Amazons S3-Bucket echo.api)
//   Header Signature-256          RSA-SHA256-Signatur des rohen Bodys, Base64
// Zusätzlich: Zeitstempel höchstens 150 s alt, Skill-ID, erlaubte Benutzer.
// Quelle: developer.amazon.com/docs/custom-skills/host-a-custom-skill-as-a-web-service.html
//
// Vertrauensanker ist die Adresse: Zertifikate werden ausschließlich per HTTPS aus
// https://s3.amazonaws.com/echo.api/ geladen (Amazons Bucket). Zusätzlich wird geprüft:
// Gültigkeitszeitraum, Name echo-api.amazon.com und dass jedes Zertifikat der Kette vom
// nächsten unterschrieben ist.

import { verify as rsaVerify, X509Certificate } from 'node:crypto';

export function checkCertUrl(raw: string): string | null {
  let u: URL;
  try { u = new URL(raw); } catch { return 'Zertifikat-URL ungültig'; }
  if (u.protocol.toLowerCase() !== 'https:') return 'Zertifikat-URL nicht https';
  if (u.hostname.toLowerCase() !== 's3.amazonaws.com') return 'Zertifikat-URL falscher Host';
  if (u.port && u.port !== '443') return 'Zertifikat-URL falscher Port';
  // URL normalisiert ".." bereits weg; Pfad muss mit /echo.api/ beginnen (Groß/klein zählt)
  if (!u.pathname.startsWith('/echo.api/')) return 'Zertifikat-URL falscher Pfad';
  return null;
}

export function splitPem(pem: string): string[] {
  return pem.match(/-----BEGIN CERTIFICATE-----[\s\S]+?-----END CERTIFICATE-----/g) ?? [];
}

// Prüft Kette + Signatur. Gibt null zurück, wenn alles stimmt, sonst den Grund.
export function checkSignature(chainPem: string, signatureB64: string, rawBody: string, now = new Date()): string | null {
  const pems = splitPem(chainPem);
  if (pems.length === 0) return 'keine Zertifikate gefunden';
  let certs: X509Certificate[];
  try { certs = pems.map((p) => new X509Certificate(p)); } catch { return 'Zertifikat nicht lesbar'; }
  const leaf = certs[0];
  if (now < new Date(leaf.validFrom) || now > new Date(leaf.validTo)) return 'Zertifikat abgelaufen oder noch nicht gültig';
  const san = (leaf.subjectAltName ?? '').split(',').map((s) => s.trim().toLowerCase());
  if (!san.includes('dns:echo-api.amazon.com')) return 'Zertifikat nicht für echo-api.amazon.com';
  for (let i = 0; i < certs.length - 1; i++) {
    if (!certs[i].checkIssued(certs[i + 1]) || !certs[i].verify(certs[i + 1].publicKey)) return 'Zertifikatskette ungültig';
  }
  if (!signatureB64) return 'Signatur fehlt';
  let ok = false;
  try {
    ok = rsaVerify('sha256', new TextEncoder().encode(rawBody), leaf.publicKey, Uint8Array.from(atob(signatureB64), (c) => c.charCodeAt(0)));
  } catch { ok = false; }
  return ok ? null : 'Signatur stimmt nicht';
}

export function checkTimestamp(ts: string | undefined, now = Date.now()): string | null {
  const t = Date.parse(ts ?? '');
  if (!t || Math.abs(now - t) > 150_000) return 'Zeitstempel zu alt';
  return null;
}
