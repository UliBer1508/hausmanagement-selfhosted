import type { LaundryArticle } from '@/hooks/useLaundryArticles';
import {
  aktuellerArtikel,
  artikelAufteilung,
  artikelJeZeile,
  kostenFuerMengen,
  setZeileFuerSchluessel,
  type SetZeilen,
} from '@/lib/linenPricing';

/*
 * Abgleich: Teuni-Rechnung gegen die Waeschebestellungen.
 *
 * Angelegt am 03.10.2026, nachdem RG-122 (Tal Yehuda, Venediger) 16,60 EUR
 * mehr kostete als die Wäschekarte auswies — und der Dialog es nicht
 * bemerkbar gemacht hatte.
 *
 * WAS SICH GEGENUEBER DER ALTEN GEGENRECHNUNG AENDERT
 *
 * Die alte Fassung (DocumentsTab, bis 02.10.2026) verglich nur MENGEN, nur
 * nach festen Schluesselnamen (`bedding`, `sink_towels` ...) und blockierte
 * nichts. Seit der Umstellung vom 05.09. heissen die Set-Schluessel je Haus
 * anders (`bettwaesche`, `bettwaescheset`), die feste Tabelle traf sie nicht
 * mehr.
 *
 * Jetzt wird je TEUNI-ARTIKELNUMMER verglichen, Menge UND Betrag, ueber
 * dieselbe Rechnung wie die Waeschekarte (`artikelAufteilung`). Das ist
 * Absicht: eine Wahrheit statt zwei.
 *
 * DIESE DATEI IST REINE LOGIK. Sie liest nichts aus der Datenbank und schreibt
 * nichts. Das Laden und Speichern macht der Aufrufer (DocumentsTab).
 *
 * WAS NICHT AUTOMATISCH ANGEGLICHEN WIRD
 *
 * `planeAngleichung` verweigert den Vorschlag, wenn die Differenz nicht
 * eindeutig auf eine Bestellposition faellt — etwa MWHT, das im Set auf zwei
 * Zeilen steht (Geschirr- und WB-Handtuecher). Dann bleibt nur "bewusst
 * akzeptieren" oder die Bestellung von Hand aendern. Geraten wird nicht.
 */

const round2 = (n: number) => Math.round(n * 100) / 100;
const gross = (s: string) => s.toUpperCase();

export interface AbgleichPosition {
  artikel: string;
  bezeichnung: string;
  menge: number;
  einheit: string;
  preis: number;
  summe: number;
}

export interface AbgleichBestellung {
  id: string;
  house_id: string | null;
  items: Record<string, number> | null;
}

export interface MengeBetrag {
  menge: number;
  betrag: number;
}

export interface AbgleichZeile {
  /** Aktuelle Artikelnummer, Nachfolgerkette (MWR -> MW3 -> MW4) aufgeloest. */
  artikelnummer: string;
  bezeichnung: string;
  rechnung: MengeBetrag;
  soll: MengeBetrag;
  /** Rechnung minus Bestellung. Positiv = Teuni hat mehr berechnet. */
  mengeDiff: number;
  betragDiff: number;
  abweichung: boolean;
  /** Menge stimmt, nur der Betrag weicht ab (Preisaenderung bei Teuni). */
  nurPreis: boolean;
  /** Auf der Rechnung, aber nicht im Sortiment (laundry_articles). */
  unbekannt: boolean;
}

export interface AbgleichErgebnis {
  zeilen: AbgleichZeile[];
  /** Rechnungspositionen ohne Mengenbezug (Lohnwaesche, Kleingewerbezeile). */
  uebersprungen: string[];
  /** Bestellschluessel ohne zuordenbaren Artikel — nicht pruefbar, nicht verschwiegen. */
  ohneArtikel: string[];
  /** Soll je Bestellung und Artikelnummer (GROSS) — Grundlage fuer die Angleichung. */
  jeBestellung: Record<string, Record<string, MengeBetrag>>;
}

/**
 * Vergleicht die Positionen einer Rechnung mit den gewaehlten Bestellungen.
 *
 * Positionen ohne Mengenbezug werden uebersprungen: Lohnwaesche nach kg,
 * Zeilen mit 0,00 EUR (KLGEW) und alles, was als nicht set-faehig gefuehrt
 * wird. Das sind DATEN (laundry_articles.set_faehig), keine Regel hier.
 */
export function bildeAbgleich(
  positionen: AbgleichPosition[],
  bestellungen: AbgleichBestellung[],
  setZeilenJeHaus: Record<string, SetZeilen>,
  artikel: LaundryArticle[],
): AbgleichErgebnis {
  // ---- Ist: was Teuni berechnet hat
  const rechnung = new Map<string, { nummer: string; bezeichnung: string; menge: number; betrag: number; bekannt: boolean }>();
  const uebersprungen: string[] = [];

  for (const p of positionen) {
    const start = artikel.find((a) => gross(a.artikelnummer) === gross(p.artikel));
    const aktuell = aktuellerArtikel(start, artikel);
    const lohnwaesche = (p.einheit ?? '').toLowerCase() === 'kg';
    const nullzeile = p.preis === 0 && p.summe === 0;
    if (lohnwaesche || nullzeile || (aktuell && !aktuell.set_faehig)) {
      uebersprungen.push(p.artikel);
      continue;
    }
    const nummer = aktuell?.artikelnummer ?? p.artikel;
    const key = gross(nummer);
    const vorher = rechnung.get(key);
    rechnung.set(key, {
      nummer,
      bezeichnung: vorher?.bezeichnung ?? aktuell?.bezeichnung ?? p.bezeichnung,
      menge: (vorher?.menge ?? 0) + p.menge,
      betrag: round2((vorher?.betrag ?? 0) + p.summe),
      bekannt: !!aktuell,
    });
  }

  // ---- Soll: was die Bestellungen nach Wäscheset enthalten
  const soll = new Map<string, { nummer: string; bezeichnung: string; menge: number; betrag: number }>();
  const jeBestellung: Record<string, Record<string, MengeBetrag>> = {};
  const ohneArtikel = new Set<string>();

  for (const b of bestellungen) {
    const zeilen = (b.house_id ? setZeilenJeHaus[b.house_id] : undefined) ?? {};
    const { posten, ohneArtikel: fehlen } = artikelAufteilung(b.items ?? {}, zeilen, artikel);
    fehlen.forEach((k) => ohneArtikel.add(k));

    const eigene: Record<string, MengeBetrag> = {};
    for (const p of posten) {
      const key = gross(p.artikelnummer);
      eigene[key] = { menge: p.menge, betrag: p.betrag };
      const vorher = soll.get(key);
      soll.set(key, {
        nummer: p.artikelnummer,
        bezeichnung: vorher?.bezeichnung ?? p.bezeichnung,
        menge: (vorher?.menge ?? 0) + p.menge,
        betrag: round2((vorher?.betrag ?? 0) + p.betrag),
      });
    }
    jeBestellung[b.id] = eigene;
  }

  // ---- Zusammenfuehren: erst alles auf der Rechnung, dann Bestelltes ohne Rechnungszeile
  const keys = [...rechnung.keys(), ...[...soll.keys()].filter((k) => !rechnung.has(k))];
  const zeilen: AbgleichZeile[] = keys.map((key) => {
    const r = rechnung.get(key);
    const s = soll.get(key);
    const rechnungWert: MengeBetrag = { menge: r?.menge ?? 0, betrag: r?.betrag ?? 0 };
    const sollWert: MengeBetrag = { menge: s?.menge ?? 0, betrag: s?.betrag ?? 0 };
    const mengeDiff = round2(rechnungWert.menge - sollWert.menge);
    const betragDiff = round2(rechnungWert.betrag - sollWert.betrag);
    const nurPreis = mengeDiff === 0 && Math.abs(betragDiff) > 0.009;
    return {
      artikelnummer: r?.nummer ?? s!.nummer,
      bezeichnung: r?.bezeichnung ?? s!.bezeichnung,
      rechnung: rechnungWert,
      soll: sollWert,
      mengeDiff,
      betragDiff,
      nurPreis,
      abweichung: mengeDiff !== 0 || nurPreis,
      unbekannt: r ? !r.bekannt : false,
    };
  });

  return { zeilen, uebersprungen, ohneArtikel: [...ohneArtikel], jeBestellung };
}

export interface Aenderung {
  schluessel: string;
  von: number;
  nach: number;
}

export interface Angleichung {
  items: Record<string, number>;
  aenderungen: Aenderung[];
  totalItems: number;
  /** null = nicht berechenbar; dann den gespeicherten Betrag NICHT ueberschreiben. */
  totalCost: number | null;
}

export type AngleichungsErgebnis =
  | { ok: true; plan: Angleichung }
  | { ok: false; grund: string };

const nein = (grund: string): AngleichungsErgebnis => ({ ok: false, grund });

/**
 * Berechnet, wie eine Bestellung aussehen muss, damit ihre Menge fuer EINEN
 * Artikel der Rechnung entspricht. Schreibt nichts.
 *
 * `items` ist der Arbeitsstand der Bestellung, nicht zwingend der gespeicherte:
 * Wer mehrere Artikel nacheinander angleicht, reicht das Ergebnis der
 * vorigen Angleichung weiter. `sollMengeBestellung` bleibt dagegen der
 * AUSGANGSSTAND dieses Artikels in dieser Bestellung (aus `jeBestellung`) —
 * die Artikel beeinflussen sich nicht gegenseitig.
 *
 * Gilt als sicher nur, was sich nach der Aenderung wieder zur Rechnungsmenge
 * zusammenrechnet: Am Ende wird mit derselben Funktion nachgerechnet, mit der
 * die Wäschekarte arbeitet. Stimmt das nicht, gibt es keinen Vorschlag.
 */
export function planeAngleichung(args: {
  zeile: AbgleichZeile;
  items: Record<string, number>;
  sollMengeBestellung: number;
  setZeilen: SetZeilen;
  artikel: LaundryArticle[];
}): AngleichungsErgebnis {
  const { zeile, sollMengeBestellung, setZeilen, artikel } = args;
  const nr = gross(zeile.artikelnummer);

  const art = artikel.find((a) => gross(a.artikelnummer) === nr);
  if (!art) return nein('Der Artikel steht nicht im Sortiment — die Zuordnung zum Wäscheset fehlt.');
  if (zeile.mengeDiff === 0) {
    return nein('Nur der Betrag weicht ab. An der Bestellung gibt es nichts anzugleichen.');
  }

  const neu = round2(sollMengeBestellung + zeile.mengeDiff);
  if (neu < 0) return nein('Diese Bestellung enthält weniger, als abgezogen werden müsste.');
  if (!Number.isInteger(neu)) return nein('Die neue Menge wäre keine ganze Zahl.');

  const zuordnung = artikelJeZeile(setZeilen, artikel);
  const zeilenKeys = Object.keys(zuordnung).filter((k) => zuordnung[k].id === art.id);
  if (zeilenKeys.length === 0) {
    return nein('Im Wäscheset dieses Hauses gibt es keine Zeile für diesen Artikel.');
  }

  const items: Record<string, number> = { ...args.items };
  const aenderungen: Aenderung[] = [];

  if (art.abrechnungsart === 'paket') {
    // Ein Paket steckt in mehreren Set-Zeilen (je Gast). Alle bestehenden
    // je-Gast-Eintraege werden im selben Verhaeltnis angepasst.
    if (sollMengeBestellung <= 0) {
      return nein('Die Bestellung enthält dieses Paket nicht — es lässt sich nichts hochrechnen.');
    }
    const faktor = neu / sollMengeBestellung;
    for (const k of Object.keys(items)) {
      const z = setZeileFuerSchluessel(k, setZeilen);
      if (!z || !zeilenKeys.includes(z)) continue;
      if (setZeilen[z]?.calculation_type !== 'per_guest') continue;
      const von = Number(items[k]);
      if (!(von > 0)) continue;
      const nach = Math.round(von * faktor);
      if (nach !== von) {
        items[k] = nach;
        aenderungen.push({ schluessel: k, von, nach });
      }
    }
  } else {
    // Stueckartikel: die Differenz muss auf GENAU eine Zeile fallen.
    if (zeilenKeys.length !== 1) {
      return nein(
        `Der Artikel steht im Wäscheset auf ${zeilenKeys.length} Zeilen — wohin die Differenz gehört, ist nicht eindeutig. Bitte in der Wäschebestellung von Hand ändern oder bewusst akzeptieren.`,
      );
    }
    const zeilenKey = zeilenKeys[0];
    const vorhandene = Object.keys(items).filter((k) => setZeileFuerSchluessel(k, setZeilen) === zeilenKey);
    if (vorhandene.length > 1) {
      return nein('Die Bestellung führt diese Zeile unter mehreren Schlüsseln — nicht eindeutig.');
    }
    const key = vorhandene[0] ?? zeilenKey;
    const von = Number(items[key] ?? 0);
    if (neu === 0) delete items[key]; else items[key] = neu;
    aenderungen.push({ schluessel: key, von, nach: neu });
  }

  if (aenderungen.length === 0) return nein('Die Bestellung hat bereits diese Menge.');

  // Gegenprobe mit derselben Rechnung wie die Wäschekarte.
  const probe = artikelAufteilung(items, setZeilen, artikel).posten
    .find((p) => gross(p.artikelnummer) === nr);
  if ((probe?.menge ?? 0) !== neu) {
    return nein(
      `Nachgerechnet ergäbe die Änderung ${probe?.menge ?? 0} statt ${neu} — nicht eindeutig, bitte von Hand ändern.`,
    );
  }

  const totalItems = Object.values(items).reduce((s, v) => s + Number(v || 0), 0);
  const mengen = Object.fromEntries(Object.entries(items).filter(([, v]) => Number(v) > 0)) as Record<string, number>;
  const totalCost = kostenFuerMengen(mengen, setZeilen, artikel).betrag;

  return { ok: true, plan: { items, aenderungen, totalItems, totalCost } };
}

/** Entscheidung zu EINER abweichenden Zeile. */
export interface Entscheidung {
  art: 'angleichen' | 'akzeptieren' | '';
  /** Pflicht bei 'akzeptieren'. */
  grund: string;
  /** Bei 'angleichen': welche der gewaehlten Bestellungen angepasst wird. */
  bestellungId: string;
}

export const leereEntscheidung = (): Entscheidung => ({ art: '', grund: '', bestellungId: '' });

export const MIN_GRUND = 3;

/** Fehlt noch etwas? Gibt eine Meldung je offene Zeile zurueck; leer = alles entschieden. */
export function offeneEntscheidungen(
  abgleich: AbgleichErgebnis,
  entscheidungen: Record<string, Entscheidung>,
): string[] {
  const offen: string[] = [];
  for (const z of abgleich.zeilen) {
    if (!z.abweichung) continue;
    const e = entscheidungen[gross(z.artikelnummer)] ?? leereEntscheidung();
    if (e.art === '') offen.push(`${z.artikelnummer}: noch nicht entschieden`);
    else if (e.art === 'akzeptieren' && e.grund.trim().length < MIN_GRUND) {
      offen.push(`${z.artikelnummer}: Begründung fehlt`);
    } else if (e.art === 'angleichen' && !e.bestellungId) {
      offen.push(`${z.artikelnummer}: Bestellung wählen`);
    }
  }
  return offen;
}

/** Schluessel, unter dem die Entscheidung zu einer Zeile gespeichert wird. */
export const entscheidungsKey = (z: AbgleichZeile) => gross(z.artikelnummer);

export interface ProtokollZeile {
  artikelnummer: string;
  bezeichnung: string;
  rechnung: MengeBetrag;
  soll: MengeBetrag;
  ergebnis: 'gleich' | 'angeglichen' | 'akzeptiert';
  grund?: string;
  bestellung_id?: string;
  aenderungen?: Aenderung[];
}

export interface Protokoll {
  version: 1;
  erstellt_am: string;
  bestellungen: string[];
  ohne_bestellung: boolean;
  uebersprungen: string[];
  ohne_artikel: string[];
  zeilen: ProtokollZeile[];
}

/** Ergebnis der Angleichungen, bereit zum Schreiben. */
export interface Umsetzung {
  /** Je Bestellung: neuer Stand. Nur Bestellungen, die sich wirklich aendern. */
  aenderungen: Record<string, Angleichung>;
  /** Zeilen, bei denen die Angleichung entgegen der Wahl nicht moeglich war. */
  gescheitert: Array<{ artikelnummer: string; grund: string }>;
  protokoll: ProtokollZeile[];
}

/**
 * Setzt alle Entscheidungen in konkrete Bestellaenderungen und ein Protokoll
 * um. Schreibt nichts.
 */
export function setzeEntscheidungenUm(args: {
  abgleich: AbgleichErgebnis;
  entscheidungen: Record<string, Entscheidung>;
  bestellungen: AbgleichBestellung[];
  setZeilenJeHaus: Record<string, SetZeilen>;
  artikel: LaundryArticle[];
}): Umsetzung {
  const { abgleich, entscheidungen, bestellungen, setZeilenJeHaus, artikel } = args;
  const arbeit: Record<string, Record<string, number>> = {};
  const aenderungenJeBestellung: Record<string, Aenderung[]> = {};
  const gescheitert: Umsetzung['gescheitert'] = [];
  const protokoll: ProtokollZeile[] = [];

  for (const z of abgleich.zeilen) {
    const basis = {
      artikelnummer: z.artikelnummer,
      bezeichnung: z.bezeichnung,
      rechnung: z.rechnung,
      soll: z.soll,
    };
    if (!z.abweichung) {
      protokoll.push({ ...basis, ergebnis: 'gleich' });
      continue;
    }
    const e = entscheidungen[entscheidungsKey(z)] ?? leereEntscheidung();

    if (e.art === 'angleichen') {
      const b = bestellungen.find((x) => x.id === e.bestellungId);
      const zeilen = (b?.house_id ? setZeilenJeHaus[b.house_id] : undefined) ?? {};
      const stand = b ? (arbeit[b.id] ?? { ...(b.items ?? {}) }) : {};
      const ergebnis = b
        ? planeAngleichung({
            zeile: z,
            items: stand,
            sollMengeBestellung: abgleich.jeBestellung[b.id]?.[gross(z.artikelnummer)]?.menge ?? 0,
            setZeilen: zeilen,
            artikel,
          })
        : nein('Bestellung nicht gefunden.');

      if (b && ergebnis.ok) {
        arbeit[b.id] = ergebnis.plan.items;
        aenderungenJeBestellung[b.id] = [...(aenderungenJeBestellung[b.id] ?? []), ...ergebnis.plan.aenderungen];
        protokoll.push({
          ...basis,
          ergebnis: 'angeglichen',
          bestellung_id: b.id,
          aenderungen: ergebnis.plan.aenderungen,
        });
      } else {
        const grund = ergebnis.ok ? 'Bestellung nicht gefunden.' : (ergebnis as { ok: false; grund: string }).grund;
        gescheitert.push({ artikelnummer: z.artikelnummer, grund });
        protokoll.push({ ...basis, ergebnis: 'akzeptiert', grund: `Angleichung nicht möglich (${grund})` });
      }
      continue;
    }

    protokoll.push({ ...basis, ergebnis: 'akzeptiert', grund: e.grund.trim() });
  }

  const aenderungen: Record<string, Angleichung> = {};
  for (const [id, items] of Object.entries(arbeit)) {
    const b = bestellungen.find((x) => x.id === id);
    const zeilen = (b?.house_id ? setZeilenJeHaus[b.house_id] : undefined) ?? {};
    const mengen = Object.fromEntries(Object.entries(items).filter(([, v]) => Number(v) > 0)) as Record<string, number>;
    aenderungen[id] = {
      items,
      aenderungen: aenderungenJeBestellung[id] ?? [],
      totalItems: Object.values(items).reduce((s, v) => s + Number(v || 0), 0),
      totalCost: kostenFuerMengen(mengen, zeilen, artikel).betrag,
    };
  }

  return { aenderungen, gescheitert, protokoll };
}
