// Tests der Alexa-Anfrageprüfung.
//   ALEXA_TEST_DIR=<ordner> deno test -A supabase/functions/alexa-max/verify.test.ts
// Der Ordner enthält mit openssl erzeugte Testzertifikate (Befehle: docs/Konzept-Alexa-Skill-Max.md §6).
import { checkCertUrl, checkSignature, checkTimestamp } from './verify.ts';

const dir = Deno.env.get('ALEXA_TEST_DIR') ?? '';
const read = (f: string) => Deno.readTextFileSync(`${dir}/${f}`);
const eq = (a: unknown, b: unknown, msg: string) => {
  if (a !== b) throw new Error(`${msg}: ${a} !== ${b}`);
};

Deno.test('Zertifikat-URL', () => {
  eq(checkCertUrl('https://s3.amazonaws.com/echo.api/echo-api-cert.pem'), null, 'gültig');
  eq(checkCertUrl('https://s3.amazonaws.com:443/echo.api/../echo.api/echo-api-cert.pem'), null, 'normalisiert gültig');
  eq(checkCertUrl('http://s3.amazonaws.com/echo.api/x.pem') !== null, true, 'http');
  eq(checkCertUrl('https://notamazon.com/echo.api/x.pem') !== null, true, 'Host');
  eq(checkCertUrl('https://s3.amazonaws.com/EcHo.aPi/x.pem') !== null, true, 'Groß/klein');
  eq(checkCertUrl('https://s3.amazonaws.com/invalid.path/x.pem') !== null, true, 'Pfad');
  eq(checkCertUrl('https://s3.amazonaws.com:563/echo.api/x.pem') !== null, true, 'Port');
  eq(checkCertUrl('https://s3.amazonaws.com/echo.api/../invalid.path/x.pem') !== null, true, 'Pfad mit ..');
});

Deno.test({ name: 'Signatur', ignore: !dir, fn: () => {
  const chain = read('leaf.pem') + read('ca.pem');
  const body = read('body.json');
  const sig = read('sig.b64').trim();
  eq(checkSignature(chain, sig, body), null, 'gültige Signatur');
  eq(checkSignature(chain, sig, body + ' '), 'Signatur stimmt nicht', 'veränderter Body');
  eq(checkSignature(chain, '', body), 'Signatur fehlt', 'ohne Signatur');
  eq(checkSignature(read('bad.pem'), sig, body)?.startsWith('Zertifikat nicht für echo-api.amazon.com'), true, 'falscher Name');
  eq(checkSignature(read('leaf.pem') + read('bad.pem'), sig, body), 'Zertifikatskette ungültig', 'falsche Kette');
  eq(checkSignature(chain, sig, body, new Date(Date.now() + 40 * 86400_000)), 'Zertifikat abgelaufen oder noch nicht gültig', 'abgelaufen');
} });

Deno.test('Zeitstempel', () => {
  eq(checkTimestamp(new Date().toISOString()), null, 'jetzt');
  eq(checkTimestamp(new Date(Date.now() - 200_000).toISOString()), 'Zeitstempel zu alt', 'alt');
  eq(checkTimestamp(undefined), 'Zeitstempel zu alt', 'fehlt');
});
