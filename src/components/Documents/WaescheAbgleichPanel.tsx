import React, { useMemo, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import type { LaundryArticle } from '@/hooks/useLaundryArticles';
import type { SetZeilen } from '@/lib/linenPricing';
import {
  entscheidungsKey,
  leereEntscheidung,
  offeneEntscheidungen,
  planeAngleichung,
  type AbgleichBestellung,
  type AbgleichErgebnis,
  type AbgleichZeile,
  type Entscheidung,
} from '@/lib/rechnungsAbgleich';

/*
 * Abgleich Teuni-Rechnung gegen Waeschebestellung — Oberflaeche.
 * Angelegt am 03.10.2026. Die Logik steht in lib/rechnungsAbgleich.ts;
 * hier wird nur angezeigt und die Entscheidung je abweichender Zeile erfasst.
 *
 * Entscheidungspflicht: Solange eine abweichende Zeile weder angeglichen noch
 * mit Begruendung akzeptiert ist, darf die Rechnung nicht angelegt werden
 * (das prueft DocumentsTab.submit ueber offeneEntscheidungen).
 */

const eur = (n: number) =>
  n.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' });
const vz = (n: number, f: (x: number) => string) => (n > 0 ? `+${f(n)}` : f(n));

interface Props {
  abgleich: AbgleichErgebnis;
  entscheidungen: Record<string, Entscheidung>;
  onChange: (next: Record<string, Entscheidung>) => void;
  bestellungen: Array<AbgleichBestellung & { label: string }>;
  setZeilenJeHaus: Record<string, SetZeilen>;
  artikel: LaundryArticle[];
}

export default function WaescheAbgleichPanel({
  abgleich, entscheidungen, onChange, bestellungen, setZeilenJeHaus, artikel,
}: Props) {
  const [sammelGrund, setSammelGrund] = useState('');
  const abweichend = abgleich.zeilen.filter((z) => z.abweichung);
  const offen = offeneEntscheidungen(abgleich, entscheidungen);

  const setze = (z: AbgleichZeile, e: Entscheidung) =>
    onChange({ ...entscheidungen, [entscheidungsKey(z)]: e });

  // Vorschlag je Zeile und Bestellung — einmal gerechnet, nicht bei jedem Klick.
  const vorschlag = useMemo(() => {
    const res: Record<string, Record<string, ReturnType<typeof planeAngleichung>>> = {};
    for (const z of abweichend) {
      res[entscheidungsKey(z)] = {};
      for (const b of bestellungen) {
        res[entscheidungsKey(z)][b.id] = planeAngleichung({
          zeile: z,
          items: { ...(b.items ?? {}) },
          sollMengeBestellung: abgleich.jeBestellung[b.id]?.[entscheidungsKey(z)]?.menge ?? 0,
          setZeilen: (b.house_id ? setZeilenJeHaus[b.house_id] : undefined) ?? {},
          artikel,
        });
      }
    }
    return res;
  }, [abweichend, bestellungen, abgleich, setZeilenJeHaus, artikel]);

  const alleAkzeptieren = () => {
    const g = sammelGrund.trim();
    if (g.length < 3) return;
    const next = { ...entscheidungen };
    for (const z of abweichend) {
      const k = entscheidungsKey(z);
      if (!next[k] || next[k].art === '') next[k] = { art: 'akzeptieren', grund: g, bestellungId: '' };
    }
    onChange(next);
  };

  return (
    <div className="mb-2 space-y-2 text-xs">
      <p className="font-medium text-amber-900">Abgleich mit der Bestellung</p>

      {bestellungen.length === 0 && (
        <p className="rounded border border-red-300 bg-red-50 p-2 text-red-800">
          Keine Bestellung gewählt – es wurde nichts bestellt, was Teuni berechnet hat. Jede Zeile
          braucht eine bewusste Entscheidung.
        </p>
      )}

      <table className="w-full">
        <thead>
          <tr className="text-amber-900">
            <th className="text-left font-medium">Artikel</th>
            <th className="text-right font-medium">Rechnung</th>
            <th className="text-right font-medium">Bestellt</th>
            <th className="text-right font-medium">Diff.</th>
          </tr>
        </thead>
        <tbody>
          {abgleich.zeilen.map((z) => (
            <tr key={z.artikelnummer} className={z.abweichung ? 'font-medium text-red-800' : ''}>
              <td className="py-0.5 pr-1">
                {z.bezeichnung} <span className="text-muted-foreground">({z.artikelnummer})</span>
              </td>
              <td className="py-0.5 text-right">{z.rechnung.menge} · {eur(z.rechnung.betrag)}</td>
              <td className="py-0.5 text-right">{z.soll.menge} · {eur(z.soll.betrag)}</td>
              <td className="py-0.5 text-right">
                {z.abweichung ? `${vz(z.mengeDiff, String)} · ${vz(z.betragDiff, eur)}` : '✓'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {abgleich.uebersprungen.length > 0 && (
        <p className="text-muted-foreground">
          Nicht geprüft (ohne Mengenbezug): {abgleich.uebersprungen.join(', ')}
        </p>
      )}
      {abgleich.ohneArtikel.length > 0 && (
        <p className="text-amber-800">
          Bestellpositionen ohne Artikelzuordnung, nicht prüfbar: {abgleich.ohneArtikel.join(', ')}
        </p>
      )}

      {abweichend.length === 0 ? (
        <p className="text-green-800">Rechnung und Bestellung stimmen überein.</p>
      ) : (
        <div className="space-y-2">
          <p className="text-red-800">
            {abweichend.length} Abweichung{abweichend.length > 1 ? 'en' : ''} – jede braucht eine
            Entscheidung, bevor die Rechnung angelegt wird.
          </p>

          {abweichend.map((z) => {
            const k = entscheidungsKey(z);
            const e = entscheidungen[k] ?? leereEntscheidung();
            const plaene = vorschlag[k] ?? {};
            const moegliche = bestellungen.filter((b) => plaene[b.id]?.ok);
            const warum = bestellungen.length === 0
              ? 'keine Bestellung gewählt'
              : (Object.values(plaene).find((p) => !p.ok) as any)?.grund;
            return (
              <div key={k} className="rounded border border-amber-300 bg-white p-2">
                <p className="mb-1 font-medium">
                  {z.bezeichnung}: {z.mengeDiff !== 0 ? `${vz(z.mengeDiff, String)} Stück` : 'nur Preis'},
                  {' '}{vz(z.betragDiff, eur)}
                </p>
                {z.unbekannt && (
                  <p className="mb-1 text-amber-800">Artikel nicht im Sortiment.</p>
                )}

                <label className={`flex items-start gap-2 py-1 ${moegliche.length === 0 ? 'opacity-50' : 'cursor-pointer'}`}>
                  <input
                    type="radio"
                    name={`ent-${k}`}
                    disabled={moegliche.length === 0}
                    checked={e.art === 'angleichen'}
                    onChange={() => setze(z, { art: 'angleichen', grund: '', bestellungId: moegliche[0]?.id ?? '' })}
                  />
                  <span>
                    Bestellung angleichen (Menge in der Bestellung korrigieren)
                    {moegliche.length === 0 && warum && (
                      <span className="block text-muted-foreground">Nicht möglich: {warum}</span>
                    )}
                  </span>
                </label>
                {e.art === 'angleichen' && moegliche.length > 1 && (
                  <select
                    className="mb-1 ml-6 w-[calc(100%-1.5rem)] rounded border bg-background p-1"
                    value={e.bestellungId}
                    onChange={(ev) => setze(z, { ...e, bestellungId: ev.target.value })}
                  >
                    {moegliche.map((b) => (
                      <option key={b.id} value={b.id}>{b.label}</option>
                    ))}
                  </select>
                )}
                {e.art === 'angleichen' && e.bestellungId && plaene[e.bestellungId]?.ok && (
                  <p className="ml-6 text-green-800">
                    {(plaene[e.bestellungId] as any).plan.aenderungen
                      .map((a: any) => `${a.schluessel}: ${a.von} → ${a.nach}`).join(', ')}
                  </p>
                )}

                <label className="flex cursor-pointer items-start gap-2 py-1">
                  <input
                    type="radio"
                    name={`ent-${k}`}
                    checked={e.art === 'akzeptieren'}
                    onChange={() => setze(z, { art: 'akzeptieren', grund: e.grund, bestellungId: '' })}
                  />
                  <span>Abweichung bewusst akzeptieren (Bestellung bleibt)</span>
                </label>
                {e.art === 'akzeptieren' && (
                  <Input
                    className="ml-6 h-8 w-[calc(100%-1.5rem)] text-xs"
                    placeholder="Begründung, z. B. mit Teuni klären"
                    value={e.grund}
                    onChange={(ev) => setze(z, { ...e, grund: ev.target.value })}
                  />
                )}
              </div>
            );
          })}

          <div className="flex gap-2">
            <Input
              className="h-8 text-xs"
              placeholder="Begründung für alle noch offenen"
              value={sammelGrund}
              onChange={(ev) => setSammelGrund(ev.target.value)}
            />
            <Button type="button" size="sm" variant="outline" onClick={alleAkzeptieren} disabled={sammelGrund.trim().length < 3}>
              Übrige akzeptieren
            </Button>
          </div>

          {offen.length > 0 && (
            <p className="text-red-800">Offen: {offen.join(' · ')}</p>
          )}
        </div>
      )}
    </div>
  );
}
